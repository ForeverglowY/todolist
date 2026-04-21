# Liquid Glass Todo

Liquid Glass 风格待办页面（HTML / CSS / JS），支持**仅浏览器本地存储**或**账号登录 + Node 后端（SQLite）** 两套用法。

## 使用方式一：账号与云端数据（推荐：多人各自待办）

数据保存在服务器目录下的 `**data/todolist.db`**（首次启动自动创建），通过 **JWT** 区分用户；密码经 **bcrypt** 哈希存储。

### 环境要求

- [Node.js](https://nodejs.org/) 18 或更高  
- 首次安装依赖：在项目根目录执行 `npm install`（会安装 `better-sqlite3` 等；Windows 若无编译工具导致失败，需安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) 的「使用 C++ 的桌面开发」或改用其他机器/环境）

### 启动

在项目根目录 `**D:\workspace\todolist`**：

```bash
npm install   # 仅第一次或依赖变更后
npm start
```

浏览器访问终端里打印的地址，一般为：[http://127.0.0.1:3000/](http://127.0.0.1:3000/)

Windows 也可双击 `**启动账号模式.bat**`（会自动 `npm install` 并启动）。

### 环境变量（可选）

复制 `**.env.example**` 为 `**.env**`（勿将 `.env` 提交到 Git）：

- `**PORT**`：服务端口，默认 `3000`  
- `**JWT_SECRET**`：**务必**改成一长串随机字符串；不设置时开发环境会用内置弱密钥并在控制台警告

### 与「纯静态」的区别

- **勿**再用 `python -m http.server` 访问本功能：那样没有 `/api/*` 接口，前端会回退为仅 `localStorage` 的离线模式。  
- 使用账号模式时，请始终通过 `**npm start` 启动的 Node 服务**打开页面。

---

## 使用方式二：无后端，仅本机离线

数据在浏览器的 `**localStorage`**（键名含 `liquid_glass_todo`），与是否开着命令行窗口无关。

### 最简单（免命令行、无账号）

在资源管理器中 **双击项目里的 `index.html`** 即可。

### 推荐（与静态托管一致，部分浏览器下 localStorage 更稳）

**双击运行 `启动预览.bat`**（会自动进入本项目目录再开 Python 简易服务器）。

或在终端里 **先进入本项目目录** 再执行：

```bash
cd D:\workspace\todolist
python -m http.server 8000
```

（不写 `--bind`，避免个别环境下出现 **ERR_EMPTY_RESPONSE**。）

浏览器打开：[http://127.0.0.1:8000/](http://127.0.0.1:8000/)  

### 若页面一片空白

多为 **未在项目根目录启动**，服务器根目录里没有 `index.html`。请确认终端里 `cd` 到包含 `index.html` 的文件夹后再启动，或直接 `**启动预览.bat`**。

### 若提示 ERR_EMPTY_RESPONSE

1. **先等终端出现** `Serving HTTP on ... port 8000`，**再**在浏览器里打开地址；或等服务起来后 **Ctrl+F5** 刷新。
2. 必须用 `**http://`**，不要用 `**https://**`。
3. 若仍不行，换一个端口：`python -m http.server 8080`，再打开 `http://127.0.0.1:8080/`。
4. 检查本机 **VPN / 代理软件** 是否劫持了本地地址，可先关闭再试。
5. 仍异常时：**直接双击 `index.html`** 打开（不经过本地服务器）。

---

## 功能概览

- Liquid Glass 风格界面与动画  
- 提醒与截止时间、编辑、删除与撤销  
- 筛选与空状态提示  
- 账号模式下：注册 / 登录、每人独立待办列表（REST + SQLite）

