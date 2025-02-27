#!/usr/bin/env python3
import os
import re
import json
import argparse
import subprocess
import difflib
from flask import Flask, request, render_template_string, send_from_directory, jsonify
import openai

# Instantiate an OpenAI client with your API key.
API_KEY = os.getenv("OPENAI_API_KEY")
client = openai.Client(api_key=API_KEY)

# Global variable for the file we are managing.
SOURCE_FILE = None

# HTML template for the chat interface.
# It loads the Marked library from a CDN to render Markdown.
HTML_TEMPLATE = """
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Project Manager Chat</title>
    <style>
      body { font-family: sans-serif; margin: 20px; }
      #header { margin-bottom: 20px; }
      #chatBox { border: 1px solid #ccc; padding: 10px; height: 400px; overflow-y: scroll; }
      .message { margin-bottom: 10px; }
      .User { color: blue; }
      .Assistant { color: green; }
      #throbber { display: none; }
    </style>
    <!-- Load Marked for Markdown parsing -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>
      // Render Markdown while escaping any raw HTML.
      function renderMarkdown(text) {
        const renderer = new marked.Renderer();
        renderer.html = function(html) {
          return html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };
        return marked.parse(text, {
          renderer: renderer,
          headerIds: false,
          mangle: false
        });
      }
    </script>
  </head>
  <body>
    <div id="header">
      <h1>Project Manager Chat Interface</h1>
      <p>Currently working on file: <strong>{{ source_file }}</strong></p>
    </div>
    <div id="chatBox">
      <!-- Existing conversation will be loaded here -->
    </div>
    <div id="throbber">⏳ Loading...</div>
    <hr>
    <form id="chatForm">
      <textarea id="promptInput" rows="5" cols="60" placeholder="Enter your prompt here..."></textarea><br>
      <input type="submit" value="Submit">
    </form>

    <script>
      const chatForm = document.getElementById('chatForm');
      const promptInput = document.getElementById('promptInput');
      const chatBox = document.getElementById('chatBox');
      const throbber = document.getElementById('throbber');

      // Append a message to the chatBox; content is rendered as Markdown.
      function appendMessage(role, content) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message';
        msgDiv.innerHTML = '<strong class="' + role + '">' + role + ':</strong><div>' + renderMarkdown(content) + '</div>';
        chatBox.appendChild(msgDiv);
      }

      // Scroll to the bottom of chatBox.
      function scrollToBottom() {
        chatBox.scrollTop = chatBox.scrollHeight;
      }

      // Load the existing conversation transcript from the server.
      async function loadTranscript() {
        try {
          const response = await fetch('/transcript');
          if (response.ok) {
            const data = await response.json();
            data.forEach(msg => appendMessage(msg.role, msg.content));
            scrollToBottom();
          }
        } catch (e) {
          console.error('Error loading transcript:', e);
        }
      }

      chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prompt = promptInput.value.trim();
        if (!prompt) return;
        appendMessage("User", prompt);
        scrollToBottom();
        promptInput.value = "";
        throbber.style.display = "block";

        try {
          const response = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: prompt })
          });
          if (response.ok) {
            const data = await response.json();
            chatBox.innerHTML = "";
            data.forEach(msg => appendMessage(msg.role, msg.content));
            scrollToBottom();
          } else {
            console.error("Server error:", response.statusText);
          }
        } catch (error) {
          console.error("Fetch error:", error);
        }
        throbber.style.display = "none";
      });

      // On startup, load the previous conversation (if any).
      loadTranscript();
    </script>
  </body>
</html>
"""

# In-memory conversation history.
chat_history = []

def transcript_filename():
    """Return the transcript filename based on the active file's basename."""
    base, _ = os.path.splitext(SOURCE_FILE)
    return f"{base}-transcript.json"

def load_transcript():
    """Load transcript from disk into chat_history (if it exists)."""
    fname = transcript_filename()
    if os.path.exists(fname):
        try:
            with open(fname, "r") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception:
            pass
    return []

def update_transcript():
    """Write the current chat_history to the transcript file and commit it to git."""
    fname = transcript_filename()
    with open(fname, "w") as f:
        json.dump(chat_history, f, indent=2)
    transcript_commit_msg = f"Update transcript for {os.path.basename(SOURCE_FILE)}"
    commit_changes(fname, transcript_commit_msg)

def extract_code(text):
    """Extract text enclosed in triple backticks (if any), else return full text."""
    match = re.search(r"```(?:\w+)?\n(.*?)```", text, re.DOTALL)
    return match.group(1).strip() if match else text.strip()

def extract_commit_summary(text):
    """Search for a line starting with 'Commit Summary:' and return its content."""
    match = re.search(r"Commit Summary:\s*(.*)", text)
    return match.group(1).strip() if match else None

def compute_diff(old_content, new_content):
    """Compute a unified diff between old_content and new_content."""
    old_lines = old_content.splitlines(keepends=True)
    new_lines = new_content.splitlines(keepends=True)
    diff_lines = difflib.unified_diff(old_lines, new_lines, fromfile="Before", tofile="After")
    return "".join(diff_lines)

def commit_changes(file_path, commit_message):
    """Stage the given file and commit changes to git with the provided commit message."""
    try:
        subprocess.run(["git", "add", file_path], check=True)
        subprocess.run(["git", "commit", "-m", commit_message], check=True)
        return True
    except subprocess.CalledProcessError:
        return False

def build_messages(system_prompt, conversation, model):
    """
    Construct the messages list for the API call.
    For the "o1-mini" model (which doesn't support a 'system' role),
    include the system prompt as the first 'user' message.
    """
    messages = []
    if model == "o1-mini":
        messages.append({"role": "user", "content": system_prompt})
    else:
        messages.append({"role": "system", "content": system_prompt})
    for msg in conversation:
        messages.append({"role": msg["role"].lower(), "content": msg["content"]})
    return messages

app = Flask(__name__)

# Route to serve static files from the static/ directory.
@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory("static", filename)

# Route to return the current transcript as JSON.
@app.route("/transcript", methods=["GET"])
def get_transcript():
    return jsonify(chat_history)

# Chat endpoint: accepts a JSON prompt, updates conversation, file, and transcript, then returns the full conversation.
@app.route("/chat", methods=["POST"])
def chat():
    global chat_history, SOURCE_FILE
    data = request.get_json()
    if not data or "prompt" not in data:
        return jsonify({"error": "No prompt provided."}), 400
    user_input = data["prompt"]
    chat_history.append({"role": "User", "content": user_input})

    first_request = not os.path.exists(SOURCE_FILE) or os.path.getsize(SOURCE_FILE) == 0

    if first_request:
        system_prompt = (
            "You are an assistant managing a software project. When given a prompt, generate the complete contents "
            "for the project file. Output only the code in a single code block (using triple backticks) without commentary."
        )
    else:
        system_prompt = (
            "You are an assistant managing a software project. The project file already has content. When given a prompt for changes, "
            "generate the complete updated file contents. Output only the updated code in a single code block (using triple backticks). "
            "Then, on a new line after the code block, output a commit summary starting with 'Commit Summary:' followed by a brief description of the changes."
        )

    model = "o1-mini"
    messages = build_messages(system_prompt, chat_history, model)

    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=1
        )
    except Exception as e:
        error_msg = f"Error calling OpenAI API: {str(e)}"
        chat_history.append({"role": "Assistant", "content": error_msg})
        update_transcript()
        return jsonify(chat_history), 500

    reply = response.choices[0].message.content
    chat_history.append({"role": "Assistant", "content": reply})

    new_file_content = extract_code(reply)
    commit_summary = extract_commit_summary(reply)

    if first_request:
        with open(SOURCE_FILE, "w") as f:
            f.write(new_file_content)
    else:
        with open(SOURCE_FILE, "r") as f:
            old_content = f.read()
        diff_text = compute_diff(old_content, new_file_content)
        if diff_text:
            with open(SOURCE_FILE, "w") as f:
                f.write(new_file_content)
            commit_msg = commit_summary if commit_summary else f"Applied changes: {user_input}"
            if not commit_changes(SOURCE_FILE, commit_msg):
                chat_history.append({"role": "Assistant", "content": "Error committing changes to git."})
        else:
            chat_history.append({"role": "Assistant", "content": "No changes detected."})

    update_transcript()
    return jsonify(chat_history)

# Main page: serves the HTML page with the active file indicator.
@app.route("/", methods=["GET"])
def index():
    return render_template_string(HTML_TEMPLATE, source_file=SOURCE_FILE)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manage a software project via the OpenAI API.")
    parser.add_argument("source_file", help="Path to the project file to manage.")
    parser.add_argument("--port", type=int, default=5000, help="Port on which the server will run (default: 5000)")
    args = parser.parse_args()

    SOURCE_FILE = args.source_file
    if not os.path.exists(SOURCE_FILE):
        open(SOURCE_FILE, "w").close()
    # Load any existing transcript for the active file into memory.
    chat_history = load_transcript()

    app.run(port=args.port)

