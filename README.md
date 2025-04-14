# QBin - 一键存储

<div align="center">
  <img src="https://s3.tebi.io/lite/favicon.svg" width="20%" alt="QBin LOGO" title="QBin LOGO" />
</div>

> ✨ 轻盈优雅的数据存储与分享服务，比云盘更便捷，超越传统 PasteBin，随时随地保存文字、代码、图片、视频等任意内容。

**<u>简体中文</u>** · [English](README_EN.md) · [演示站点](https://qbin.me) · [使用文档](Docs/document.md) · [自托管教程](Docs/self-host.md) · [接口文档](Docs/REST%20API.md)

## 🖼️ 功能预览

![](https://s3.tebi.io/lite/mobile-preview.jpg)

----

![](https://s3.tebi.io/lite/windows-preview.jpg)


## 📝 项目简介

QBin 致力于打造一个快速、安全且专业的在线编辑分享平台：  
• 前端基于纯 HTML+JS+CSS，无需繁杂框架，轻量无多余依赖。  
• 内置 Monaco 代码编辑器、Cherry Markdown 渲染器、通用编辑器，满足多种内容场景。  
• 支持一键存储文字、图片、视频等文件，并能设置自定义访问路径、密码和有效期。  
• 后端使用 Deno Oak 框架、PostgreSQL + Deno KV 多级缓存，加速全球访问；还实现了 Edge Cache、ETag 协商缓存，力求极致性能。  
• 提供 PWA 离线支持、IndexedDB 本地存储，即使断网也可编辑与读取。  

分布式架构 + 多级缓存，让存取更快更稳定。像记事本一般随开即用，灵活程度媲美 PasteBin，却拥有更丰富的编辑能力与安全防护。  
开启您的云上数据时代，即刻拥有一个轻巧、优雅又功能强大的数据存储服务！

## ✨ 项目特性

- 🚀 **极简存储**：轻松保存文字、代码、图片、音视频等任意类型，一键分享
- 🔒 **安全可控**：支持自定义访问路径和密码保护
- ⏱️ **灵活期限**：可设置存储有效期，数据过期自动删除
- 🌓 **明暗切换**：支持深色 / 浅色 / 跟随系统模式，夜间使用更护眼
- 📱 **PWA 离线**：断网也能编辑、读取本地缓存，随时可用
- 🔄 **实时保存**：自动定时保存到本地及远程，减少数据丢失风险
- 🔑 **多种登录**：支持 OAuth2（Google、GitHub、Microsoft、自定义）和 账号密码登录
- ♻️ **多级缓存**：Deno KV、PostgreSQL、Edge Cache 与 ETag 结合，提升访问速度

## 🚀 快速使用指南

1. 访问已部署的 QBin 链接 (或本地环境)
2. 默认管理员密码为 “qbin”，可通过环境变量 “ADMIN_PASSWORD” 进行修改
3. 登录后可在“通用 / Code / Markdown”任意编辑器里输入内容或拖拽上传文件
4. 设置链接路径、过期时间、密码保护 (可选)  
5. 自动保存并生成分享链接或二维码  
6. 访问链接查看或下载内容 (若有密码则需输入密码)

更多详细用法可参考 [使用指南](Docs/document.md)。

## 🔧 技术栈
前端:  
• 纯 HTML + JS + CSS (无额外框架)  
• Monaco 代码编辑器 + Cherry Markdown + 通用编辑器  

后端:  
• Deno 运行时  
• Oak 框架  
• PostgreSQL 数据库  
• Deno KV & Edge Cache 多级缓存  
• JWT + 账号密码认证

## ⚡ 自托管部署

### Docker Compose 一键部署 (推荐)

```bash
git clone https://github.com/Quick-Bin/Qbin.git
cd qbin
docker-compose up -d
```

启动后访问 http://localhost:8000，即可使用 QBin 服务。  
(默认管理员密码为 “qbin”，如需修改请在 docker-compose.yml 中设置)

### Docker 命令行部署

以下指令适用于已准备 PostgreSQL 数据库的场景：
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

访问 http://localhost:8000 即可使用 QBin。 

> 友情提示：如需免费 PostgreSQL，可考虑 [Neon](https://neon.tech/)、[Aiven](https://aiven.io/) 或 [Render](https://render.com/docs/deploy-mysql) 提供的托管服务。

### 其他部署方式

支持在 Deno Deploy、本地环境等多种场景运行。详见 [自托管教程](Docs/self-host.md)。

## 🚀 TODO
- [ ] 实现端到端加密 
- [x] 添加 Markdown / 音频 / 视频在线预览  
- [x] 增加个人中心面板 
- [x] 增加 Docker 部署支持
- [x] 增加第三方 OAuth2 (Google, GitHub, Microsoft 等) 登录  
- [x] 后端多级热 - 冷存储  
- [x] 移动端 + 深色模式适配  
- [x] ETag 协商缓存与 IndexedDB 本地存储  
- [x] 自定义存储路径、密码和有效期  
- [x] 数据自动本地备份 

## 🤝 参与贡献

1. Fork 项目 (GitHub 上点击 “Fork”)  
2. 创建功能分支：`git checkout -b feature/amazing-feature`  
3. 提交更改：`git commit -m "Add amazing feature"`  
4. 推送分支：`git push origin feature/amazing-feature`  
5. 发起 Pull Request，等待合并

## ❤ 赞助支持

如果 QBin 对您有所帮助，请考虑通过 [爱发电](https://afdian.com/a/naihe) 进行赞助。  
您的支持将帮助项目持续优化与升级！

<a title="QBin Sponsor" href="https://afdian.com/a/naihe" target="_blank" rel="noopener">
  <img src="https://s3.tebi.io/lite/Sponsor.svg" width="25%" alt="QBin Sponsor" title="QBin Sponsor" />
</a>

## 许可证

本项目采用 [GPL-3.0](LICENSE) 协议开源，欢迎自由使用与二次开发。  
让我们一同构建开放、共享的云上存储未来！
