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
      body { font-family: sans-serif; margin: 20px; display: flex; flex-direction: column; }
      #header { margin-bottom: 20px; }
      #container { display: flex; gap: 20px; }
      .section { border: 1px solid #ccc; padding: 10px; flex: 1; overflow-y: auto; height: 600px; }
      #codeSection { }
      #changelogSection { }
      #conversationSection { }
      textarea { width: 100%; height: 100%; resize: none; }
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
      .message { margin-bottom: 10px; }
      .User { color: blue; }
      .Assistant { color: green; }
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

      document.addEventListener("DOMContentLoaded", () => {
        const chatForm = document.getElementById('chatForm');
        const promptInput = document.getElementById('promptInput');
        const throbber = document.getElementById('throbber');

        const codeTextarea = document.getElementById('codeTextarea');
        const changelogBox = document.getElementById('changelogBox');
        const conversationBox = document.getElementById('conversationBox');

        // Append a message to a given container; content is rendered as Markdown.
        function appendMessage(container, role, content) {
          const msgDiv = document.createElement('div');
          msgDiv.className = 'message';
          msgDiv.innerHTML = '<strong class="' + role + '">' + role + ':</strong><div>' + renderMarkdown(content) + '</div>';
          container.appendChild(msgDiv);
        }

        // Scroll a container to the bottom.
        function scrollToBottom(container) {
          container.scrollTop = container.scrollHeight;
        }

        // Load the existing conversation transcript from the server.
        async function loadTranscript() {
          try {
            const response = await fetch('/transcript');
            if (response.ok) {
              const data = await response.json();
              
              // Populate code section
              if (data.latest_code) {
                codeTextarea.value = data.latest_code;
              } else {
                // Fallback to chat history if latest_code is not available
                const latestCode = data.chat_history.find(msg => msg.role === "Assistant" && msg.code);
                if (latestCode) {
                  codeTextarea.value = latestCode.code;
                }
              }

              // Populate changelog section
              if (data.changelog) {
                data.changelog.forEach(commit => {
                  appendMessage(changelogBox, "Assistant", `${commit.commit_hash}: ${commit.commit_message}`);
                });
                scrollToBottom(changelogBox);
              } else {
                // Fallback to chat history if changelog is not available
                data.chat_history.forEach(msg => {
                  if (msg.role === "Assistant" && msg.commit_summary) {
                    appendMessage(changelogBox, "Assistant", msg.commit_summary);
                  }
                });
                scrollToBottom(changelogBox);
              }

              // Populate conversation section
              data.chat_history.forEach(msg => {
                if (msg.role === "User" || (msg.role === "Assistant" && msg.conversation)) {
                  if (msg.role === "Assistant" && msg.conversation) {
                    appendMessage(conversationBox, msg.role, msg.conversation);
                  } else {
                    appendMessage(conversationBox, msg.role, msg.content);
                  }
                }
              });
              scrollToBottom(conversationBox);
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
          appendMessage(conversationBox, "User", prompt);
          scrollToBottom(conversationBox);
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
              // Update code section
              const latest = data.chat_history[data.chat_history.length - 1];
              if (latest.code) {
                codeTextarea.value = latest.code;
              }

              // Update changelog section
              if (latest.commit_summary) {
                appendMessage(changelogBox, "Assistant", latest.commit_summary);
                scrollToBottom(changelogBox);
              }

              // Update conversation section
              if (latest.conversation) {
                appendMessage(conversationBox, "Assistant", latest.conversation);
                scrollToBottom(conversationBox);
              }
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
      });
    </script>
  </head>
  <body>
    <div id="header">
      <h1>Project Manager Chat Interface</h1>
      <p>Currently working on file: <strong>{{ source_file }}</strong></p>
    </div>
    <div id="container">
      <div id="codeSection" class="section">
        <h2>Latest Code</h2>
        <textarea id="codeTextarea" readonly></textarea>
      </div>
      <div id="changelogSection" class="section">
        <h2>Changelogs</h2>
        <div id="changelogBox"></div>
      </div>
      <div id="conversationSection" class="section">
        <h2>Conversation</h2>
        <div id="conversationBox"></div>
      </div>
    </div>
    <div id="throbber"></div>
    <hr>
    <form id="chatForm">
      <textarea id="promptInput" rows="5" cols="60" placeholder="Enter your prompt here..."></textarea><br>
      <input type="submit" value="Submit">
    </form>
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
                if isinstance(data, dict):
                    return data
        except Exception:
            pass
    return {"chat_history": [], "latest_code": "", "changelog": []}

def update_transcript():
    """Write the current chat_history to the transcript file and commit it to git."""
    fname = transcript_filename()
    transcript_data = {
        "chat_history": chat_history,
        "latest_code": read_source_file(),
        "changelog": get_last_n_git_commits(20)
    }
    with open(fname, "w") as f:
        json.dump(transcript_data, f, indent=2)
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

def extract_conversation(text):
    """Extract the conversational part after the code block and commit summary."""
    code_end = text.find("```", text.find("```") + 3)
    if code_end == -1:
        return ""
    commit_start = text.find("Commit Summary:", code_end)
    if commit_start == -1:
        return ""
    conversation = text[commit_start + len("Commit Summary:"):].strip()
    return conversation

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

def build_prompt_messages(system_prompt, transcript, source_file, model, coding_contexts):
    """
    Build a list of messages for the API:
      - Include the coding contexts at the beginning of the system prompt.
      - Include the system prompt. If the model is "o1-mini" (which doesn't support 'system'),
        include it as a user message prefixed with "SYSTEM:".
      - For each user message, include it verbatim.
      - For each assistant message, include only the commit summary and conversation.
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
    for msg in transcript["chat_history"]:
        role = msg["role"].lower()
        if role == "assistant":
            commit = extract_commit_summary(msg["content"])
            convo = extract_conversation(msg["content"])
            if commit:
                messages.append({"role": "assistant", "content": commit})
            if convo:
                messages.append({"role": "assistant", "content": convo})
        else:
            messages.append({"role": "user", "content": msg["content"]})
    final_msg = {
        "role": "user",
        "content": "The following is the code which has been generated so far:\n" + transcript["latest_code"]
    }
    messages.append(final_msg)
    return messages

def read_source_file():
    """Read and return the content of the source file."""
    try:
        with open(SOURCE_FILE, "r") as f:
            return f.read()
    except Exception:
        return ""

def get_last_n_git_commits(n=20):
    """Retrieve the last n git commits."""
    try:
        result = subprocess.run(
            ["git", "log", f"-n{n}", "--pretty=format:%H|%s"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True
        )
        commits = []
        for line in result.stdout.strip().split('\n'):
            if '|' in line:
                commit_hash, commit_message = line.split('|', 1)
                commits.append({"commit_hash": commit_hash, "commit_message": commit_message})
        return commits
    except subprocess.CalledProcessError as e:
        print(f"Error retrieving git commits: {e.stderr}")
        return []

app = Flask(__name__)

# Route to serve static files from the static/ directory.
@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory("static", filename)

# Route to return the current transcript as JSON.
@app.route("/transcript", methods=["GET"])
def get_transcript():
    transcript = {
        "chat_history": chat_history,
        "latest_code": read_source_file(),
        "changelog": get_last_n_git_commits(20)
    }
    return jsonify(transcript)

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
            "You are an assistant managing a software project. When given a prompt, generate the complete contents "
            "for the project file. Output only the code in a single code block (using triple backticks) without commentary."
        )
    else:
        system_prompt = (
            "You are an assistant managing a software project. The project file already has content. When given a prompt for changes, "
            "generate the complete updated file contents. Output only the updated code in a single code block (using triple backticks). "
            "Then, on a new line after the code block, output a commit summary starting with 'Commit Summary:' followed by a brief description of the changes. "
            "Additionally, provide a conversational response as if you're a coworker discussing the changes."
        )

    transcript = load_transcript_from_disk()
    messages = build_prompt_messages(system_prompt, transcript, SOURCE_FILE, "o1-mini", CODING_CONTEXTS)

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
        return jsonify({"chat_history": chat_history}), 500

    reply = response.choices[0].message.content
    # Parse the reply into code, commit summary, and conversation
    new_file_content = extract_code(reply)
    commit_summary = extract_commit_summary(reply)
    conversation = extract_conversation(reply)

    if new_file_content:
        chat_history.append({"role": "Assistant", "content": reply, "code": new_file_content, "commit_summary": commit_summary, "conversation": conversation})
    else:
        chat_history.append({"role": "Assistant", "content": reply})

    if new_file_content:
        if not os.path.exists(SOURCE_FILE) or os.path.getsize(SOURCE_FILE) == 0:
            with open(SOURCE_FILE, "w") as f:
                f.write(new_file_content)
        else:
            old_content = read_source_file()
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
    return jsonify({
        "chat_history": chat_history,
        "latest_code": read_source_file(),
        "changelog": get_last_n_git_commits(20)
    })

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
    transcript = load_transcript_from_disk()
    CODING_CONTEXTS = load_coding_contexts(args.contexts)

    app.run(port=args.port)