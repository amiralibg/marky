# 🖋️ Marky

**Marky** is an offline-first Markdown note-taking application built with Tauri, React, and Rust. It provides a simple, clean interface with features like wiki-linking, multi-tab support, and a dynamic graph view of your notes.

## ✨ Features

- **📄 Multi-Tab Interface**: Open and switch between multiple notes.
- **🎨 Live Preview**: Real-time markdown rendering with a resizable split-pane editor.
- **🔗 WikiLinks**: Connect notes using `[[WikiLink]]` syntax.
- **🕸️ Interactive Graph View**: Visualize note connections with zoom and pan support.
- **📁 Local First**: Works directly with your local files. Changes in your folder are reflected in the app.
- **⌨️ Keyboard Shortcuts**: Support for core actions like New Note, Save, and Search.

## 🛠️ Technology Stack

- **Frontend**: React (v18), Vite, TailwindCSS (v4)
- **State Management**: Zustand
- **Backend**: Rust, Tauri (v2)
- **Markdown**: Marked.js with custom WikiLink extension
- **File Watching**: `notify` (Rust)

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (latest LTS recommended)
- [Rust](https://www.rust-lang.org/tools/install)
- [pnpm](https://pnpm.io/) (used in this project)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/marky.git
   cd marky
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Run in development mode:
   ```bash
   pnpm tauri:dev
   ```

## 📦 Building for Production

To create a production-ready installer for your operating system:

```bash
pnpm tauri:build
```

The output will be found in:
- **macOS**: `src-tauri/target/release/bundle/dmg/` or `.../macos/`
- **Windows**: `src-tauri/target/release/bundle/msi/` or `.../nsis/`
- **Linux**: `src-tauri/target/release/bundle/deb/` or `.../appimage/`

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
