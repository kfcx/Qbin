/**
 * 多级缓存管理
 * - 内存 (memCache)
 * - Cache API (Deno Deploy KV-like)
 * - Deno KV (for meta) + Postgres (最终存储)
 */
import { Metadata } from "../types.ts";
import { PASTE_STORE, CACHE_CHANNEL } from "../config/constants.ts";
import { checkPassword } from "./common.ts";

export const memCache = new Map<string, Metadata | Record<string, unknown>>();
export const kv = await Deno.openKv();
export const cacheBroadcast = new BroadcastChannel(CACHE_CHANNEL);

cacheBroadcast.onmessage = async (event: MessageEvent) => {
  const { type, key, metadata } = event.data;
  if (!key) return;
  if (type === "update" && key && metadata) {
    await updateCache(key, metadata);
  } else if (type === "delete" && key) {
    await updateCache(key, metadata);
  }
};

export async function isCached(key: string, pwd?: string | undefined, repo): Promise<Metadata | null> {
  const memData = memCache.get(key);
  if (memData && "pwd" in memData) {
    if ("pwd" in memData) return memData;
  }

  const kvResult = await kv.get([PASTE_STORE, key]);
  if (!kvResult.value){
    memCache.set(key, {'pwd': "!"});   // 减少内查询
    return null;
  }

  // 解决pg到kv批量同步问题
  if (kvResult.value === true){
    const dbData = await repo.getByFkey(key);
    if (!dbData) return null;
    if (!checkPassword(dbData.pwd, pwd)) return null;
    await updateCache(key, dbData);
    delete dbData.content;
    kvResult.value = dbData;
  }
  // kv不同步
  memCache.set(key, kvResult.value);   // 减少内查询
  return kvResult.value;
}

export async function checkCached(key: string, pwd?: string | undefined, repo): Promise<Metadata | null> {
  const memData = memCache.get(key);
  if (memData && "pwd" in memData) {
    if (!checkPassword(memData.pwd, pwd)) return null;
    if ("content" in memData) return memData;
  }

  const kvResult = await kv.get([PASTE_STORE, key]);
  if (!kvResult.value){
    memCache.set(key, {'pwd': "!"});   // 减少内查询
    return null;
  }
  if (!checkPassword(kvResult.value.pwd, pwd)){
    memCache.set(key, {'pwd': kvResult.value.pwd});   // 减少内查询
    return null;
  }
  return kvResult.value;
}

/**
 * 从缓存中获取数据，如果缓存未命中，则从 KV 中获取并缓存
 */
export async function getCachedContent(key: string, pwd?: string, repo): Promise<Metadata | null> {
  try {
    const cache = await checkCached(key, pwd, repo);
    if (cache === null) return cache;
    if (cache !== true && "content" in cache) return cache;

    const dbData = await repo.getByFkey(key);
    if (!dbData) return null;
    if (!checkPassword(dbData.pwd, pwd)) return null;
    await updateCache(key, dbData);
    return dbData;
  } catch (error) {
    console.error('Cache fetch error:', error);
    return null;
  }
}

/**
 * 更新缓存（写入内存和 Cache API）
 */
export async function updateCache(key: string, metadata: Metadata): Promise<void> {
  try {
    memCache.set(key, metadata);
  } catch (error) {
    console.error('Cache update error:', error);
  }
}

/**
 * 删除缓存 (内存 + Cache API)
 */
export async function deleteCache(key: string, pwd: string, expire: number) {
  try {
    memCache.set(key, {'pwd': pwd, expire: expire});
  } catch (error) {
    console.error('Cache deletion error:', error);
  }
}