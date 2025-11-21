# 🎨 Voice-Driven Excalidraw Clone

> A virtual whiteboard that listens to you. Draw, move, and edit shapes using just your voice.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![Status](https://img.shields.io/badge/Status-Active_Development-green)

## 📖 Overview

**Voice-Driven Excalidraw Clone** is an open-source drawing tool inspired by [Excalidraw](https://excalidraw.com), enhanced with **Voice Command capabilities**. It allows users to sketch hand-drawn-like diagrams, wireframes, and illustrations while controlling the canvas hands-free.

Whether you are presenting, teaching, or just brainstorming, this tool lets you say *"Draw a rectangle"* or *"Change color to red"* to speed up your workflow.

## ✨ Features

- **🎙️ Voice Control**: Create shapes, select tools, and modify properties using voice commands.
- **✏️ Hand-drawn Style**: Maintains the classic rough-sketch aesthetic of Excalidraw.
- **🛠️ Standard Tools**: Supports Rectangles, Circles, Arrows, Lines, and Free-draw pencils.
- **🎨 Property Customization**: Change stroke color, background fill, and stroke width via voice or UI.
- **💾 Local Storage**: Automatically saves your work to the browser.
- **🌓 Dark/Light Mode**: Voice-activated theme switching.

## 🗣️ Voice Commands (Examples)

| Intent | Voice Command | Action |
| :--- | :--- | :--- |
| **Select Tool** | *"Select rectangle"*, *"Pick pencil"* | Switches the active tool. |
| **Draw Shape** | *"Draw a circle"*, *"Add a square"* | Places the shape on the center of the screen. |
| **Change Color** | *"Color red"*, *"Make it blue"* | Changes the stroke color of the selected element. |
| **Edit Actions** | *"Undo"*, *"Redo"*, *"Clear canvas"* | Performs the respective editor action. |

## 🛠️ Tech Stack

- **Frontend**: React.js / TypeScript
- **Canvas Library**: Rough.js / HTML5 Canvas
- **Voice Recognition**: Web Speech API / `react-speech-recognition`
- **State Management**: Context API / Redux
- **Styling**: Tailwind CSS / CSS Modules

## 🚀 Getting Started

Follow these steps to set up the project locally.

### Prerequisites
* Node.js (v14 or higher)
* npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/chitranshuajmera0000/Voice-Driven-Excalidraw-Clone
   cd your-repo
   ```

2.  **Install dependencies**

    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Start the development server**

    ```bash
    npm start
    # or
    yarn start
    ```

4.  Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 🛡️ License

Distributed under the MIT License. See `LICENSE` for more information.

## 📞 Contact

Project maintainer on GitHub.

Project Link: https://voice-driven-excalidraw-clone.vercel.app/