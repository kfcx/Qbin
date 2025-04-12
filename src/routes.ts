import { Router, Context } from "https://deno.land/x/oak/mod.ts";
import { MetadataDB } from "./db/metadata.ts";
import { getCachedContent, updateCache, kv, isCached, memCache, cacheBroadcast } from "./utils/cache.ts";
import { getTimestamp, cyrb53, checkPassword, generateKey } from "./utils/common.ts";
import {
  VALID_CHARS_REGEX,
  reservedPaths,
  mimeTypeRegex,
  MAX_UPLOAD_FILE_SIZE,
  PASTE_STORE,
  EMAIL, ISDEMO
} from "./config/constants.ts";
import { AppState, Metadata } from "./types.ts";
import { PasteError, Response } from "./utils/response.ts";
import {
  getEditHtml,
  getCodeEditHtml,
  renderHtml,
  getFavicon,
  getJS,
  getCSS,
  getFONTS,
  getDocumentHtml,
  getHomeHtml,
  getMDEditHtml,
  getServiceWorker,
  getManifest, getIMG, getLoginPageHtml
} from "./utils/render.ts";
import { handleAdminLogin, handleLogin, handleOAuthCallback } from "./middlewares/auth.ts";


function parsePathParams(params: Record<string, string>) {
  // 访问路径长度 path >= 2 && path <= 32
  const key = params.key;
  const pwd = params.pwd;
  if (key && (key.length > 32 || key.length < 2 || !VALID_CHARS_REGEX.test(key)))
    return {key: null, pwd: null};
  if (pwd && (pwd.length > 32 || pwd.length < 1 || !VALID_CHARS_REGEX.test(pwd)))
    return {key: null, pwd: null};
  return {
    key: key || generateKey(),
    pwd: pwd || "",
  };
}
/**
 * 上传（POST/PUT）处理函数
 */
async function handleContentUpload(ctx: Context<AppState>, key: string, pwd: string, pdb: MetadataDB) {
  const request = ctx.request;
  const headers = request.headers;

  // const clientIp = headers.get("cf-connecting-ip") || request.ip;
  const clientIp = request.ip;
  const expire = getTimestamp() + ~~(headers.get("x-expire") || "315360000");

  // 1) 基础验证
  const contentLength = parseInt(headers.get("Content-Length") || "0", 10);
  if (contentLength > MAX_UPLOAD_FILE_SIZE) {
    throw new PasteError(413, "Content too large");
  }
  const contentType = headers.get("Content-Type") || "application/octet-stream";
  if (!mimeTypeRegex.test(contentType) || contentType.length > 100) {
    throw new PasteError(415, "Invalid Content-Type format");
  }

  // 2) 读取 body
  const content = await request.body.arrayBuffer();
  if (content.byteLength > MAX_UPLOAD_FILE_SIZE || contentLength !== content.byteLength) {
    throw new PasteError(413, "Content too large");
  }

  const hash = cyrb53(content);
  // 3) 从 JWT 中读取用户信息
  const payload = ctx.state.session?.get("user");
  const email = payload.email as string;
  const uname = payload.name as string;

  // 4) 构造 Metadata
  const metadata: Metadata = {
    fkey: key,
    time: getTimestamp(),
    expire: expire,
    ip: clientIp,
    content,
    type: contentType,
    len: contentLength,
    pwd: pwd || "",
    email,
    uname,
    hash
  };

  // 5) 在 KV 中预占 key (防止重复)
  const kvRes = await kv.atomic()
    .check({ key: [PASTE_STORE, key], versionstamp: null })
    .set([PASTE_STORE, key], {
      email,
      name: uname,
      ip: clientIp,
      len: contentLength,
      expire: expire,
      hash: hash,
      pwd,
    }, { expireIn: null })
    .commit();

  if (!kvRes.ok) {
    return new Response(ctx, 409, "Key already exists");
  }

  // 6) 先更新内存 / Cache API
  memCache.set(key, metadata);

  // 7) 后台异步写 Postgres
  const cleanupKV = async (retries = 3, delay = 500) => {
    for (let i = 0; i < retries; i++) {
      try {
        await kv.delete([PASTE_STORE, key]);
        console.log(`KV cleanup success for key: ${key}`);
        return true;
      } catch (err) {
        console.error(`KV cleanup attempt ${i+1} failed:`, err);
        if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
      }
    }
    console.error(`Failed to cleanup KV for key ${key} after ${retries} attempts`);
    return false;
  };

  queueMicrotask(async () => {
    try {
      const fkey = await pdb.create(metadata);
      await updateCache(key, metadata);
      console.log("Background DB create success:", fkey);
    } catch (err) {
      console.error("Background DB create error:", err);
      // 保证原子性 - 使用带重试的清理函数
      memCache.delete(key);                 // 先执行同步的 Map 删除（这个不会失败）
      await cleanupKV();                    // 再执行异步的 KV 删除（带重试机制）
      cacheBroadcast.postMessage({ type: "delete", key });  // 通知其他节点删除
    }
  });
  return new Response(ctx, 200, "success", { key, pwd, url: `${request.url.origin}/r/${key}/${pwd}` })
}

async function handleContentUpdate(ctx: Context<AppState>, key: string, pwd: string, pdb: MetadataDB) {
  const request = ctx.request;
  const headers = request.headers;
  // const clientIp = headers.get("cf-connecting-ip") || request.ip;
  const clientIp = request.ip;
  const expire = getTimestamp() + ~~(headers.get("x-expire") || "315360000");

  const contentLength = parseInt(headers.get("Content-Length") || "0", 10);
  if (contentLength > MAX_UPLOAD_FILE_SIZE) {
    throw new PasteError(413, "Content too large");
  }
  const contentType = headers.get("Content-Type") || "application/octet-stream";
  if (!mimeTypeRegex.test(contentType) || contentType.length > 100) {
    throw new PasteError(415, "Invalid Content-Type format");
  }

  const content = await request.body.arrayBuffer();
  if (content.byteLength > MAX_UPLOAD_FILE_SIZE || contentLength !== content.byteLength) {
    throw new PasteError(413, "Content too large");
  }

  const hash = cyrb53(content);
  const payload = ctx.state.session?.get("user");
  const email = payload.email as string;
  const uname = payload.name as string;

  const metadata: Metadata = {
    fkey: key,
    time: getTimestamp(),
    expire: expire,
    ip: clientIp,
    content,
    type: contentType,
    len: contentLength,
    pwd: pwd || "",
    email,
    uname,
    hash
  };

  const originalKvData = await kv.get([PASTE_STORE, key]);

  const kvRes = await kv.atomic()
    .set([PASTE_STORE, key], {
      email,
      name: uname,
      ip: clientIp,
      len: contentLength,
      expire: expire,
      hash: hash,
      pwd,
    }, { expireIn: null })
    .commit();

  if (!kvRes.ok) {
    return new Response(ctx, 500, "Failed to update key in KV store");
  }

  const oldMetadata = memCache.get(key);

  memCache.set(key, metadata);

  const restoreKV = async (retries = 3, delay = 500) => {
    for (let i = 0; i < retries; i++) {
      try {
        if (originalKvData.value) {
          await kv.set([PASTE_STORE, key], originalKvData.value);
          console.log(`KV restore success for key: ${key}`);
          return true;
        } else {
          await kv.delete([PASTE_STORE, key]);
          console.log(`KV cleanup success for key: ${key} (no original data)`);
          return true;
        }
      } catch (err) {
        console.error(`KV restore attempt ${i+1} failed:`, err);
        if (i < retries - 1) await new Promise(r => setTimeout(r, delay));
      }
    }
    console.error(`Failed to restore KV for key ${key} after ${retries} attempts`);
    return false;
  };
  queueMicrotask(async () => {
    try {
      const result = await pdb.update(key, metadata);
      if (!result) {
        throw new PasteError(400, "PG更新数据失败!");
      }
      await updateCache(key, metadata);
      cacheBroadcast.postMessage({ type: "update", key, metadata });  // 通知更新状态
    } catch (err) {
      console.error("Background DB update error:", err);

      // 恢复内存缓存
      if (oldMetadata) {
        memCache.set(key, oldMetadata);
      } else {
        memCache.delete(key);
      }

      // 恢复 KV 缓存（带重试逻辑）
      await restoreKV();

      // 通知其他节点
      cacheBroadcast.postMessage({
        type: oldMetadata ? "update" : "delete",
        key,
        metadata: oldMetadata
      });
    }
  });

  return new Response(ctx, 200, "success", { key, pwd, url: `${request.url.origin}/r/${key}/${pwd}` })
}

/**
 * 将Postgres数据库中的所有fkeys同步到Deno KV存储
 * 使用批处理和原子操作实现
 */
async function syncPostgresToKV(ctx: Context<AppState>, pdb: MetadataDB) {
  try {
    // 从Postgres数据库获取所有fkeys
    const pgFkeys = await pdb.getAllFkeys();
    const pgFkeysSet = new Set(pgFkeys);

    // 追踪同步统计信息
    let added = 0;
    let removed = 0;
    let unchanged = 0;

    // 处理现有KV条目
    const kvEntries = kv.list({ prefix: [PASTE_STORE] });
    const kvFkeysSet = new Set<string>();
    const toRemove = [];

    // 识别需要删除的fkeys（存在于KV中但不在Postgres中）
    for await (const entry of kvEntries) {
      const fkey = entry.key[1] as string;

      if (!pgFkeysSet.has(fkey)) {
        toRemove.push(["qbin", fkey]);
      } else {
        kvFkeysSet.add(fkey);
        unchanged++;
      }
    }

    // 批量删除过期的fkeys
    const batchSize = 100; // 根据系统限制优化批次大小
    for (let i = 0; i < toRemove.length; i += batchSize) {
      const batch = toRemove.slice(i, i + batchSize);
      if (batch.length > 0) {
        const atomicOp = kv.atomic();
        for (const key of batch) {
          atomicOp.delete(key);
        }
        await atomicOp.commit();
        removed += batch.length;
      }
    }

    // 识别需要添加的fkeys（存在于Postgres但不在KV中）
    const toAdd = [];
    for (const fkey of pgFkeys) {
      if (!kvFkeysSet.has(fkey)) {
        toAdd.push(fkey);
      }
    }

    // 批量添加新fkeys
    for (let i = 0; i < toAdd.length; i += batchSize) {
      const batch = toAdd.slice(i, i + batchSize);
      if (batch.length > 0) {
        const atomicOp = kv.atomic();
        for (const fkey of batch) {
          atomicOp.set(["qbin", fkey], true);
        }
        await atomicOp.commit();
        added += batch.length;
      }
    }

    ctx.response.status = 200;
    ctx.response.body = {
      success: true,
      stats: {
        added, // 新增的fkey数量
        removed, // 移除的fkey数量
        unchanged, // 保持不变的fkey数量
        total: pgFkeys.length // 总fkey数量
      }
    };

  } catch (error) {
    console.error("同步Postgres到KV时出错:", error);
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      error: error.message
    };
  }
}

const router = new Router<AppState>();

/**
 * /e/key/pwd 文本编辑器，上传...
 * /c/key/pwd 代码编辑器
 * /m/key/pwd markdown编辑器
 */
router
  .get("/favicon.ico", async (ctx) => {
    return await getFavicon(ctx, 200);
  })
  .get("/document", async (ctx) => {
    return await getDocumentHtml(ctx, 200);
  })
  .get("/health", async (ctx) => {
    return new Response(ctx, 200, "healthy");
  })
  .get("/login", async (ctx) => {
    return await getLoginPageHtml(ctx, 200);
  })
  .get("/service-worker.js", async (ctx) => {
    return await getServiceWorker(ctx, 200);
  })
  .get("/manifest.json", async (ctx) => {
    return await getManifest(ctx, 200);
  })
  .get("/static/js/:file", async (ctx) => {
    return await getJS(ctx, ctx.params.file, 200);
  })
  .get("/static/css/:file", async (ctx) => {
    return await getCSS(ctx, ctx.params.file, 200);
  })
  .get("/static/css/fonts/:file", async (ctx) => {
    return await getFONTS(ctx, ctx.params.file, 200);
  })
  .get("/static/img/:file", async (ctx) => {
      return await getIMG(ctx, ctx.params.file, 200);
    })
  .get("/home", async (ctx) => {
    return await getHomeHtml(ctx, 200);
  })    // 用户主页
  .get("/r/:key?/:pwd?", async (ctx) => {
    if (ctx.params.key === undefined) return new Response(ctx, 404, "访问路径不能为空");
    const { key, pwd } = parsePathParams(ctx.params);
    if (key === null) {
      return new Response(ctx, 403, "该访问路径不可用");
    }
    const pdb = MetadataDB.getInstance();
    const _metadata = await isCached(key, pwd, pdb);
    if (_metadata?.email === undefined || (_metadata.expire || 0) < getTimestamp()) {
      return new Response(ctx, 404, "访问内容不存在");
    }
    if (_metadata.pwd && !checkPassword(_metadata.pwd, pwd)) {
      return new Response(ctx, 403, "访问密码错误");
    }
    const metadata = await getCachedContent(key, pwd, pdb);
    if(!(metadata && "content" in metadata)){
      return new Response(ctx, 404, "访问内容不存在");
    }
    ctx.state.metadata = { etag: metadata?.hash, time: metadata?.time ?? null };
    ctx.response.headers.set('Pragma', 'no-cache');
    ctx.response.headers.set('Cache-Control', 'no-cache, must-revalidate');  // private , must-revalidate | , max-age=3600
    ctx.response.headers.set("Content-Type", metadata.type);
    ctx.response.headers.set("Content-Length", metadata.len.toString());
    ctx.response.body = metadata.content;
  })    // get raw
  .head("/r/:key?/:pwd?", async (ctx) => {
    if (ctx.params.key === undefined) return new Response(ctx, 404, "访问路径不能为空");
    const { key, pwd } = parsePathParams(ctx.params);
    if (key === null) {
      return new Response(ctx, 403, "该访问路径不可用");
    }
    const pdb = MetadataDB.getInstance();
    const _metadata = await isCached(key, pwd, pdb);
    if (_metadata?.email === undefined || (_metadata.expire || 0) < getTimestamp()) {
      ctx.response.status = 404;
      return;
    }
    if (_metadata.pwd && !checkPassword(_metadata.pwd, pwd)) { ctx.response.status = 403; return; }
    ctx.response.status = 200;
    ctx.response.headers.set("Content-Type", _metadata.type);
    ctx.response.headers.set("Content-Length", _metadata.len.toString());
  })    // head raw
  .get("/p/:key?/:pwd?", async (ctx) => {
    return await renderHtml(ctx, 200);
  })    // render
  .get("/e/:key?/:pwd?", async (ctx) => {
    return await getEditHtml(ctx, 200);
  })    // edit
  .get("/c/:key?/:pwd?", async (ctx) => {
    return await getCodeEditHtml(ctx, 200);
  })    // code edit
  .get("/m/:key?/:pwd?", async (ctx) => {
    return await getMDEditHtml(ctx, 200);
  })    // markdown edit
  .get(/^\/?[a-zA-Z0-9]?\/?$/, async (ctx) => {
    const defaultEditor = await ctx.cookies.get("qbin-editor");
    switch (defaultEditor) {
      case "e":
        return await getEditHtml(ctx, 200);
      case "c":
        return await getCodeEditHtml(ctx, 200);
      case "m":
        return await getMDEditHtml(ctx, 200);
      default:
        return await getMDEditHtml(ctx, 200);
    }
  })
  .post("/s/:key/:pwd?", async (ctx) => {
    const { key, pwd } = parsePathParams(ctx.params);
    if (key === null) {
      return new Response(ctx, 403, "该访问路径不可用");
    }
    if(reservedPaths.has(key.toLowerCase())){
      return new Response(ctx, 403, "不能修改保留路径");
    }
    const pdb = MetadataDB.getInstance();
    const metadata = await isCached(key, pwd, pdb);

    if(metadata && "email" in metadata) {
      if (metadata.expire > getTimestamp()){
        const email = await ctx.state.session?.get("user")?.email;
        if (!(email !== undefined && metadata.email === email)) {
          return new Response(ctx, 403, "您没有该KEY的内容修改权限");
        }
      }
      await handleContentUpdate(ctx, key, pwd || "", pdb);  // 更新
    }else {
      await handleContentUpload(ctx, key, pwd || "", pdb);  // 创建
    }
  })
  .put("/s/:key/:pwd?", async (ctx) => {
    const { key, pwd } = parsePathParams(ctx.params);
    if (key === null) {
      return new Response(ctx, 403, "该访问路径不可用");
    }
    if(reservedPaths.has(key.toLowerCase())){
      return new Response(ctx, 403, "不能修改保留路径");
    }
    const pdb = MetadataDB.getInstance();
    const metadata = await isCached(key, pwd, pdb);
    if(metadata && "email" in metadata) {
      if ((metadata.expire || 0) > getTimestamp()){
        return new Response(ctx, 409, "Key already exists");
      }
      await handleContentUpdate(ctx, key, pwd || "", pdb);  // 更新
    }else {
      await handleContentUpload(ctx, key, pwd || "", pdb);
    }
  })
  .delete("/d/:key/:pwd?", async (ctx) => {
    if (ctx.params.key === undefined) return new Response(ctx, 404, "访问路径不能为空");
    const { key, pwd } = parsePathParams(ctx.params);
    if (key === null) {
      return new Response(ctx, 403, "该访问路径不可用");
    }
    if(reservedPaths.has(key.toLowerCase())){
      return new Response(ctx, 403, "不能删除保留路径");
    }

    const pdb = MetadataDB.getInstance();
    const metadata = await isCached(key, pwd, pdb);
    if (!metadata || (metadata.expire || 0) < getTimestamp()) {
      return new Response(ctx, 404, "内容不存在");
    }
    if(!(checkPassword(metadata.pwd, pwd) && "email" in metadata)){
      return new Response(ctx, 403, "密码错误");
    }
    // 验证是否本人或管理员
    const email = await ctx.state.session?.get("user")?.email;
    if (!(email !== undefined && metadata.email === email)) {
      return new Response(ctx, 403, "您没有删除该内容的权限");
    }

    delete metadata.content;  // 删除不必要信息
    metadata.len = 0;
    const expire = metadata.expire;
    if(expire > 0) metadata.expire = -expire;
    // 并发删除 KV/Cache
    await Promise.all([
      updateCache(key, metadata),
      kv.set([PASTE_STORE, key], metadata),
    ]);
    cacheBroadcast.postMessage({ type: "delete", key, metadata });  // 通知删除状态
    // 异步删除数据库记录
    queueMicrotask(async () => {
      await pdb.update(key, {content: new Uint8Array(0), expire: metadata.expire}); // 更新三级缓存, 执行真实删除
      // await pdb.delete(key);     // TODO 删除异常处理
    });

    ctx.response.headers.set("Content-Type", "application/json");
    return new Response(ctx, 200, "success")
  })
  .post("/api/login/admin", handleAdminLogin)
  .get("/api/login/:provider", handleLogin)
  .get("/api/login/oauth2/callback/:provider", handleOAuthCallback)
  .post("/api/user/logout", async (ctx) => {
    await ctx.cookies.delete("token", {
      path: "/",
      httpOnly: true,
      sameSite: "strict"
    });
    return new Response(ctx, 200, "Logged out successfully");
  })
  .post("/api/user/token", async (ctx) => {
    // 获取基本请求信息
    const referer = ctx.request.headers.get("referer");
    const origin = ctx.request.headers.get("origin");

    if (!referer || referer.includes("/r/") || referer.includes("/m/")) {
      return new Response(ctx, 403, "不允许从同源链接页面请求token");
    }
    if (referer === origin) {
      return new Response(ctx, 403, "检测到可疑的Referer策略");
    }
    const refererUrl = new URL(referer);
    if (refererUrl.pathname === "/" || refererUrl.pathname === "") {
      return new Response(ctx, 403, "不允许使用仅包含域名的Referer");
    }

    const token = await ctx.cookies.get("token");
    return new Response(ctx, 200, "success", { token: token });
  })
  .get("/api/user/info", async (ctx) => {
    const data = await ctx.state.session?.get("user");
    return new Response(ctx, 200, "success", data);
  })
  .get("/api/user/storage", async (ctx) => {
    const user = ctx.state.session?.get("user");
    if (!user || !user.email) return new Response(ctx, 401, "请先登录");

    const url = new URL(ctx.request.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(url.searchParams.get("pageSize") || "10", 10);

    if (isNaN(page) || page < 1) return new Response(ctx, 400, "无效的页码");
    if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) return new Response(ctx, 400, "无效的每页数量");

    const offset = (page - 1) * pageSize;
    try {
      const pdb = MetadataDB.getInstance();
      const { items, total } = await pdb.findByEmail(user.email, pageSize, offset);

      const safeItems = items.map(item => ({
        fkey: item.fkey,
        time: item.time,
        expire: item.expire,
        type: item.type,
        len: item.len,
        pwd: item.pwd,
      }));

      const totalPages = Math.ceil(total / pageSize);
      return new Response(ctx, 200, "success", {
        items: safeItems,
        pagination: {
          total,
          page,
          pageSize,
          totalPages
        }
      });
    } catch (error) {
      console.error("获取用户存储数据时出错:", error);
      return new Response(ctx, 500, "获取数据失败");
    }
  })
  .get("/api/admin/storage", async (ctx) => {
    const user = ctx.state.session?.get("user");
    if(ISDEMO){
      return new Response(ctx, 403, "演示站点功能不可用");
    }
    if (user.email !== EMAIL) {
      return new Response(ctx, 403, "您没有管理员权限");
    }

    const url = new URL(ctx.request.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(url.searchParams.get("pageSize") || "10", 10);

    if (isNaN(page) || page < 1) return new Response(ctx, 400, "无效的页码");
    if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) return new Response(ctx, 400, "无效的每页数量");

    const offset = (page - 1) * pageSize;
    try {
      const pdb = MetadataDB.getInstance();
      const { items, total } = await pdb.listAll(pageSize, offset);

      const totalPages = Math.ceil(total / pageSize);
      return new Response(ctx, 200, "success", {
        items,
        pagination: {
          total,
          page,
          pageSize,
          totalPages
        }
      });
    } catch (error) {
      console.error("获取管理员存储数据时出错:", error);
      return new Response(ctx, 500, "获取数据失败");
    }
  })
  .get("/api/admin/sync", async (ctx) => {
    const email = await ctx.state.session?.get("user")?.email;
    if(ISDEMO){
      return new Response(ctx, 403, "演示站点功能不可用");
    }
    if (!(email !== undefined && EMAIL === email)) {
      return new Response(ctx, 403, "您没有管理员权限");
    }
    const pdb = MetadataDB.getInstance();
    return await syncPostgresToKV(ctx, pdb);
  })    // kv与pg同步
  // .post("/api/user/shares", async (ctx) => {
  //   return new Response(ctx, 200, "success", [{ }]);
  // })
  // .post("/api/data/clean", async (ctx) => {
  // });   // 清理过期key


export default router;
