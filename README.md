<div align="center"><a name="readme-top"></a>
<img src="https://s3.tebi.io/lite/favicon.svg" width="20%" alt="QBin LOGO" title="QBin LOGO" />
<h1>QBin - 一键存储</h1>

✨ 轻盈优雅的数据存储服务，比云盘更便捷，轻松存取文字、图片、视频等任意数据。

**简体中文** · [English](README_EN.md) · [Demo](https://qbin.me) · [使用文档](Docs/document.md) · [自托管教程](Docs/self-host.md) · [RESTAPI](Docs/REST%20API.md)

</div>

## 📝 项目简介

✨ 内置 Code 和 Markdown 编辑器，一键存储文字、代码、图片、视频等数据。 <br/>
分布式架构+多级缓存让存取速度更快，像记事本般简单，比云盘更便捷，随手记录，即存即用，开启您的云上数据时代！

## ✨ 项目特性

- 🚀 **便捷存储**：一键保存文字、代码、图片、视频等任意类型
- 🔒 **安全可控**：支持自定义访问路径和密码保护
- ⏱️ **灵活期限**：可设置内容过期时间
- 🌓 **深色模式**：完美适配明暗两种主题
- 📱 **全面适配**：支持桌面端和移动端
- 🔄 **自动保存**：定时本地、远程双备份，保证数据安全
- 📵 **离线访问**：断网也能正常编辑、读取本地缓存
- 🔑 **第三方登录**：支持 OAuth2（Google、GitHub、Microsoft, 自定义）授权

## 🖼️ 界面预览

|                                            桌面端界面                                            |                                               移动端界面                                                |
|:-------------------------------------------------------------------------------------------:|:--------------------------------------------------------------------------------------------------:|
|    <img src="https://s3.tebi.io/lite/windows.png" alt="桌面端预览" title="桌面端预览" width="70%">    |        <img src="https://s3.tebi.io/lite/mobile.png" alt="移动端界面" title="移动端界面" width="30%">        |

|                                                登录/Markdown Editor界面                                                |                                                List/Grid存储管理界面                                                |
|:------------------------------------------------------------------------------------------------------------------:|:-------------------------------------------------------------------------------------------------------------:|
|             <img src="https://s3.tebi.io/lite/preview-login.png" alt="登录预览" title="登录预览" width="100%">             |   <img src="https://s3.tebi.io/lite/preview-storage.png" alt="List存储管理预览" title="List存储管理预览" width="100%">    |
| <img src="https://s3.tebi.io/lite/preview-editor-markdown.png" alt="Markdown编辑器" title="Markdown编辑器" width="100%"> | <img src="https://s3.tebi.io/lite/preview-storage-grid.png" alt="Grid存储管理预览" title="Grid存储管理预览" width="100%"> |


## 🚀 快速使用指南

### 登录服务

1. 访问部署好的 QBin 服务
2. 默认管理员密码是 `qbin`（可通过环境变量 `ADMIN_PASSWORD` 修改）
3. 登录后即可选择（多功能、Code、Markdown）编辑器进行使用

### 分享内容

1. 登录后进入编辑器界面
2. 设置访问路径和密码（可选）
3. 设置过期时间（可选）
4. 输入文字或上传文件
5. 自动保存并获取分享链接

### 访问内容

1. 通过分享链接或QR码访问内容
2. 如有密码保护，输入正确密码访问
3. 查看或下载内容

> 详细使用教程请查看 [使用指南](https://qbin.me/r/document)

## ⚡ 自托管部署

### Docker Compose 一键部署（推荐）

```bash
git clone https://github.com/Quick-Bin/qbin.git
cd qbin
docker-compose up -d
```

访问 http://localhost:8000 即可使用 QBin 服务，所有配置已在 docker-compose.yml 中预设好（默认管理员密码为 `qbin`）。

### Docker 命令行部署

```bash
# 拉取最新镜像
docker pull naiher/qbin:latest

# 启动容器
docker run -it -p 8000:8000 \
  -e DATABASE_URL="postgresql://user:password@localhost:5432:/local:main?sslmode=require" \
  -e JWT_SECRET="your_jwt_secret" \
  -e ADMIN_PASSWORD="qbin" \
  -e ADMIN_EMAIL="admin@qbin.github" \
  naiher/qbin
```

启动后，访问 http://localhost:8000 即可使用 QBin 服务。

> 注意：使用 Docker 命令行部署需要准备 PostgreSQL 数据库。[Neon](https://neon.tech/)、[Aiven](https://aiven.io/) 或 [Render](https://render.com/docs/deploy-mysql) 均提供免费数据库方案。

### 其他部署方式

如需使用 Deno Deploy 或本地开发，请参考 [自托管教程](Docs/self-host.md) 获取详细步骤。

## 🚀 TODO
- [ ] 实现端到端加密
- [x] 实现对渲染界面Markdown、音频、视频预览
- [x] 增加个人中心面板
- [x] 增加 MarkDown 编辑器
- [x] 增加 Code 编辑器
- [x] 增加 API 第三方调用接口
- [x] 增加 Docker 部署支持
- [x] 实现 OAuth2（Google、Github、Microsoft, 自定义） 授权登录
- [x] 后端热-冷多级存储
- [x] 适配移动端、深色模式
- [x] 实现 ETag 协商缓存
- [x] 实现本地 IndexedDB 存储
- [x] 实现存储自定义路径、自定义密码
- [x] 实现自定义存储有效期
- [x] 实现数据定时缓存到本地

## 🤝 参与贡献

欢迎通过以下方式参与项目：

1. [Fork 项目](https://github.com/Quick-Bin/Qbin/fork)
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

## ❤ 赞助支持

如果 QBin 对您有所帮助，欢迎通过 [爱发电](https://afdian.com/a/naihe) 提供赞助支持！

<a title="QBin Sponsor" href="https://afdian.com/a/naihe" target="_blank" rel="noopener">
  <img src=https://s3.tebi.io/lite/Sponsor.svg width=25% alt="QBin Sponsor" title="QBin Sponsor" />
</a>

## 许可证

本项目采用 [GPL-3.0](LICENSE) 许可证开源。
