#!/usr/bin/env python3
import os
import re
import json
import argparse
import subprocess
import difflib
from flask import Flask, request, render_template_string, send_from_directory
import openai

# Instantiate an OpenAI client with your API key.
API_KEY = os.getenv("OPENAI_API_KEY")
client = openai.Client(api_key=API_KEY)

# Global variable for the file we are managing.
SOURCE_FILE = None

# HTML template for the chat interface.
HTML_TEMPLATE = """
<!doctype html>
<html>
  <head>
    <title>Project Manager Chat</title>
    <style>
      body { font-family: sans-serif; margin: 20px; }
      .chat-box { border: 1px solid #ccc; padding: 10px; height: 400px; overflow-y: scroll; }
      .message { margin-bottom: 10px; }
      .user { color: blue; }
      .assistant { color: green; }
    </style>
  </head>
  <body>
    <h1>Project Manager Chat Interface</h1>
    <div class="chat-box">
      {% for msg in history %}
        <div class="message">
          <strong class="{{ msg.role }}">{{ msg.role }}:</strong>
          <pre style="white-space: pre-wrap;">{{ msg.content }}</pre>
        </div>
      {% endfor %}
    </div>
    <hr>
    <form method="post">
      <textarea name="prompt" rows="5" cols="60" placeholder="Enter your prompt here..."></textarea><br>
      <input type="submit" value="Submit">
    </form>
  </body>
</html>
"""

# In-memory conversation history.
chat_history = []

def transcript_filename():
    """Return the transcript filename based on the source file basename."""
    base, _ = os.path.splitext(SOURCE_FILE)
    return f"{base}-transcript.json"

def load_transcript():
    """Load the transcript from disk into chat_history, if it exists."""
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
    """Write the current chat_history to the transcript file and commit it."""
    fname = transcript_filename()
    with open(fname, "w") as f:
        json.dump(chat_history, f, indent=2)
    # Commit the transcript update.
    transcript_commit_msg = f"Update transcript for {os.path.basename(SOURCE_FILE)}"
    commit_changes(fname, transcript_commit_msg)

def extract_code(text):
    """
    Extracts text enclosed in triple backticks (optionally with a language hint).
    If no code block is found, returns the entire text.
    """
    match = re.search(r"```(?:\w+)?\n(.*?)```", text, re.DOTALL)
    return match.group(1).strip() if match else text.strip()

def extract_commit_summary(text):
    """
    Searches for a line starting with 'Commit Summary:' and returns the summary.
    """
    match = re.search(r"Commit Summary:\s*(.*)", text)
    return match.group(1).strip() if match else None

def compute_diff(old_content, new_content):
    """
    Computes a unified diff between old_content and new_content.
    """
    old_lines = old_content.splitlines(keepends=True)
    new_lines = new_content.splitlines(keepends=True)
    diff_lines = difflib.unified_diff(old_lines, new_lines, fromfile="Before", tofile="After")
    return "".join(diff_lines)

def commit_changes(file_path, commit_message):
    """
    Stages the given file and commits changes to git with the provided commit message.
    """
    try:
        subprocess.run(["git", "add", file_path], check=True)
        subprocess.run(["git", "commit", "-m", commit_message], check=True)
        return True
    except subprocess.CalledProcessError:
        return False

def build_messages(system_prompt, conversation, model):
    """
    Constructs the messages list for the API call.
    Since the o1-mini model does not support a "system" message,
    we incorporate the system instructions as the first message with role "user".
    The remaining conversation is appended normally.
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

@app.route("/", methods=["GET", "POST"])
def index():
    global chat_history, SOURCE_FILE
    if request.method == "POST":
        user_input = request.form["prompt"]
        chat_history.append({"role": "User", "content": user_input})

        # Determine if this is the first request (i.e. file is empty or non-existent).
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
            chat_history.append({"role": "Assistant", "content": f"Error calling OpenAI API: {str(e)}"})
            return render_template_string(HTML_TEMPLATE, history=chat_history)

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

        # Update and commit the transcript.
        update_transcript()

        return render_template_string(HTML_TEMPLATE, history=chat_history)

    return render_template_string(HTML_TEMPLATE, history=chat_history)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manage a software project via the OpenAI API.")
    parser.add_argument("source_file", help="Path to the project file to manage.")
    parser.add_argument("--port", type=int, default=5000, help="Port on which the server will run (default: 5000)")
    args = parser.parse_args()

    SOURCE_FILE = args.source_file

    # Create the source file if it doesn't exist.
    if not os.path.exists(SOURCE_FILE):
        open(SOURCE_FILE, "w").close()

    # Load existing transcript if available.
    chat_history = load_transcript()

    app.run(port=args.port)

