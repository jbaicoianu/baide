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

# Global variables for the file we are managing, coding contexts, and debugging.
SOURCE_FILE = None
CODING_CONTEXTS = []
DEBUG = False

# HTML template for the chat interface.
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
      /* CSS spinner */
      #throbber {
        display: none;
        width: 40px;
        height: 40px;
        border: 4px solid #ccc;
        border-top: 4px solid #333;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 20px auto;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      /* Styles for the source code editor */
      #sourceCodeContainer {
        margin-top: 20px;
      }
      #sourceCode {
        width: 100%;
        height: 400px;
        font-family: monospace;
        font-size: 14px;
        padding: 10px;
        border: 1px solid #ccc;
        resize: none;
      }
    </style>
    <!-- Load Marked for Markdown parsing -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>
      // Render Markdown while escaping any raw HTML.
      function renderMarkdown(text) {
        const renderer = new marked.Renderer();
        renderer.html = function(html) {
          return String(html).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };
        return marked.parse(text, {
          renderer: renderer,
          headerIds: false,
          mangle: false
        });
      }

      // Function to load source code into the editor
      async function loadSourceCode() {
        try {
          const response = await fetch('/source');
          if (response.ok) {
            const data = await response.json();
            document.getElementById('sourceCode').value = data.content;
          }
        } catch (e) {
          console.error('Error loading source code:', e);
        }
      }

      // Function to update source code from the editor (optional)
      async function updateSourceCode() {
        const updatedContent = document.getElementById('sourceCode').value;
        try {
          const response = await fetch('/update_source', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: updatedContent })
          });
          if (response.ok) {
            console.log('Source code updated successfully.');
          } else {
            console.error('Failed to update source code.');
          }
        } catch (e) {
          console.error('Error updating source code:', e);
        }
      }

      // Append a message to chatBox; content is rendered as Markdown.
      function appendMessage(role, content) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message';
        msgDiv.innerHTML = '<strong class="' + role + '">' + role + ':</strong><div>' + renderMarkdown(content) + '</div>';
        chatBox.appendChild(msgDiv);
      }

      // Scroll chatBox to the bottom.
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

      // Listen for Ctrl+Enter to submit the form.
      promptInput.addEventListener("keydown", function(e) {
        if (e.ctrlKey && e.key === "Enter") {
          e.preventDefault();
          chatForm.dispatchEvent(new Event("submit", {cancelable: true}));
        }
      });

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
            // Reload the source code after AI updates
            await loadSourceCode();
          } else {
            console.error("Server error:", response.statusText);
          }
        } catch (error) {
          console.error("Fetch error:", error);
        }
        throbber.style.display = "none";
      });

      // On startup, load the previous conversation (if any) and the source code.
      window.onload = function() {
        loadTranscript();
        loadSourceCode();
      };
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
    <div id="throbber"></div>
    <hr>
    <form id="chatForm">
      <textarea id="promptInput" rows="5" cols="60" placeholder="Enter your prompt here..."></textarea><br>
      <input type="submit" value="Submit">
    </form>

    <!-- New Section for Source Code Editor -->
    <div id="sourceCodeContainer">
      <h2>Source Code Editor</h2>
      <textarea id="sourceCode" readonly></textarea>
      <!-- Optional: Add a button to manually update source code if editing is allowed -->
      <!-- <button onclick="updateSourceCode()">Update Source Code</button> -->
    </div>
  </body>
</html>
"""

# In-memory conversation history.
chat_history = []

def transcript_filename():
    """Return the transcript filename based on the active file's basename."""
    base, _ = os.path.splitext(SOURCE_FILE)
    return f"{base}-transcript.json"

def load_transcript_from_disk():
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

def extract_commit_summary(text):
    """Search for a line starting with 'Commit Summary:' and return its content."""
    match = re.search(r"Commit Summary:\s*(.*)", text)
    return match.group(1).strip() if match else ""

def extract_code(text):
    """
    Extract the contents of the first code block using a simple state machine.
    The code block is assumed to start with a line that (after stripping whitespace)
    starts with three backticks and ends when a line that is exactly three backticks is encountered.
    """
    lines = text.splitlines()
    in_code_block = False
    code_lines = []
    for line in lines:
        stripped = line.strip()
        if not in_code_block:
            if stripped.startswith("```"):
                in_code_block = True
            continue
        else:
            if stripped == "```":
                break
            code_lines.append(line)
    return "\n".join(code_lines).strip()

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

def load_coding_contexts(context_names):
    """Load coding contexts from the contexts/ directory based on provided context names."""
    contexts = []
    for name in context_names:
        context_path = os.path.join("contexts", f"{name}.txt")
        if os.path.exists(context_path):
            try:
                with open(context_path, "r") as f:
                    content = f.read().strip()
                    if content:
                        contexts.append(content)
            except Exception as e:
                print(f"Error loading context '{name}': {e}")
        else:
            print(f"Context file '{context_path}' does not exist.")
    return contexts

def build_prompt_messages(system_prompt, conversation, source_file, model, coding_contexts):
    """
    Build a list of messages for the API:
      - Include the coding contexts at the beginning of the system prompt.
      - Include the system prompt. If the model is "o1-mini" (which doesn't support 'system'),
        include it as a user message prefixed with "SYSTEM:".
      - For each user message, include it verbatim.
      - For each assistant message, include only the commit summary.
      - Append a final user message with the current on-disk file contents.
    """
    messages = []
    if coding_contexts:
        combined_context = "\n".join([f"Context: {ctx}" for ctx in coding_contexts])
        system_prompt = f"{combined_context}\n\n{system_prompt}"
    if model == "o1-mini":
        messages.append({"role": "user", "content": "SYSTEM: " + system_prompt})
    else:
        messages.append({"role": "system", "content": system_prompt})
    for msg in conversation:
        role = msg["role"].lower()
        if role == "assistant":
            commit = extract_commit_summary(msg["content"])
            messages.append({"role": role, "content": commit})
        else:
            messages.append({"role": role, "content": msg["content"]})
    try:
        with open(source_file, "r") as f:
            file_contents = f.read()
    except Exception:
        file_contents = ""
    final_msg = {
        "role": "user",
        "content": "The following is the code which has been generated so far:\n" + file_contents
    }
    messages.append(final_msg)
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

# New Route to get the current source code content
@app.route("/source", methods=["GET"])
def get_source():
    if not os.path.exists(SOURCE_FILE):
        return jsonify({"content": ""})
    try:
        with open(SOURCE_FILE, "r") as f:
            content = f.read()
        return jsonify({"content": content})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# New Route to update the source code (optional)
@app.route("/update_source", methods=["POST"])
def update_source():
    data = request.get_json()
    if not data or "content" not in data:
        return jsonify({"error": "No content provided."}), 400
    new_content = data["content"]
    try:
        with open(SOURCE_FILE, "w") as f:
            f.write(new_content)
        commit_msg = "Manually updated source code via web UI."
        if commit_changes(SOURCE_FILE, commit_msg):
            return jsonify({"message": "Source code updated successfully."})
        else:
            return jsonify({"error": "Failed to commit changes to git."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Chat endpoint: accepts a JSON prompt, updates conversation, file, and transcript, then returns the full conversation.
@app.route("/chat", methods=["POST"])
def chat():
    global chat_history, SOURCE_FILE, DEBUG
    data = request.get_json()
    if not data or "prompt" not in data:
        return jsonify({"error": "No prompt provided."}), 400
    user_input = data["prompt"]
    chat_history.append({"role": "User", "content": user_input})

    if not os.path.exists(SOURCE_FILE) or os.path.getsize(SOURCE_FILE) == 0:
        system_prompt = (
            "You are an assistant managing a software project. When given a prompt, respond with a brief professional message summarizing the changes and any questions or suggestions you have. Then, generate the complete contents for the project file. Output only the code in a single code block (using triple backticks) without additional commentary."
        )
    else:
        system_prompt = (
            "You are an assistant managing a software project. The project file already has content. When given a prompt for changes, respond with a brief professional message summarizing the changes and any questions or suggestions you have. Then, generate the complete updated file contents. Output only the updated code in a single code block (using triple backticks). "
            "Then, on a new line after the code block, output a commit summary starting with 'Commit Summary:' followed by a brief description of the changes."
        )

    messages = build_prompt_messages(system_prompt, chat_history, SOURCE_FILE, "o1-mini", CODING_CONTEXTS)

    if DEBUG:
        print("DEBUG: AI prompt messages:")
        print(json.dumps(messages, indent=2))

    try:
        response = client.chat.completions.create(
            model="o1-mini",
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

    if not os.path.exists(SOURCE_FILE) or os.path.getsize(SOURCE_FILE) == 0:
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
    parser.add_argument("--debug", action="store_true", help="Print full AI prompt on each API call for debugging.")
    parser.add_argument("--contexts", nargs='*', default=[], help="List of coding contexts to apply.")
    args = parser.parse_args()

    SOURCE_FILE = args.source_file
    DEBUG = args.debug
    if not os.path.exists(SOURCE_FILE):
        open(SOURCE_FILE, "w").close()
    chat_history = load_transcript_from_disk()
    CODING_CONTEXTS = load_coding_contexts(args.contexts)

    app.run(port=args.port)