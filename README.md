# 🎨 Voice-Driven Excalidraw Clone

> A virtual whiteboard that listens to you. Create diagrams, notes, and flowcharts using natural language voice commands.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-black?style=flat&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Status](https://img.shields.io/badge/Status-Active_Development-green)

## 📖 Overview

**Voice-Driven Excalidraw Clone** is an intelligent drawing tool that integrates **Excalidraw** with a powerful **AI Voice Assistant**. Instead of manually selecting tools, you can simply describe what you want—whether it's a flowchart, a checklist, or a system diagram—and the AI will generate it for you on the canvas.

It leverages **Mistral AI** (or OpenAI) to interpret natural language and converts it into structured Excalidraw elements, making brainstorming and documentation faster and hands-free.

## ✨ Features

- **🎙️ AI Voice Assistant**: Understands natural language descriptions and context.
- **📊 Automatic Diagramming**: Converts spoken descriptions of processes into **Mermaid.js** flowcharts and renders them as Excalidraw elements.
- **📝 Smart Note Taking**: Dictate notes, checklists, and summaries that are automatically formatted and grouped.
- **🔄 Context-Aware Updates**: The assistant remembers conversation history, allowing you to refine diagrams or add to notes (e.g., "Add a step after the login process").
- **🎨 Intelligent Layout**: Automatically positions new elements to avoid overlap and groups related content.
- **💾 Local Storage**: Persists your canvas state.

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (React)
- **Language**: TypeScript
- **Whiteboard Engine**: [Excalidraw](https://excalidraw.com/)
- **AI Processing**: Mistral AI / OpenAI API
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

## 🚀 Getting Started

Follow these steps to set up the project locally.

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- An API key for **Mistral AI** or **OpenAI**

### Installation

1.  **Clone the repository**

    ```bash
    git clone https://github.com/chitranshuajmera0000/Voice-Driven-Excalidraw-Clone.git
    cd Voice-Driven-Excalidraw-Clone
    ```

2.  **Install dependencies**

    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Configure Environment Variables**

    Create a `.env.local` file in the root directory (or rename `.env.example`):

    ```bash
    cp .env.example .env.local
    ```

    Add your API key:

    ```env
    MISTRAL_API_KEY=your_api_key_here
    # or
    OPENAI_API_KEY=your_api_key_here
    ```

4.  **Start the development server**

    ```bash
    npm run dev
    # or
    yarn dev
    ```

5.  Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

## 💡 Usage

1.  Click the **Microphone** icon in the bottom toolbar.
2.  Speak your command. Examples:
    *   *"Create a flowchart for a user login system."*
    *   *"Add a note with a checklist for launch requirements."*
    *   *"Update the diagram to include a password reset step."*
3.  Watch as the AI generates and places the elements on the canvas.
4.  Toggle **Continuous Mode** for hands-free interaction during meetings.

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

**Chitranshu Ajmera** - [GitHub Profile](https://github.com/chitranshuajmera0000)

Project Link: [https://github.com/chitranshuajmera0000/Voice-Driven-Excalidraw-Clone](https://github.com/chitranshuajmera0000/Voice-Driven-Excalidraw-Clone)