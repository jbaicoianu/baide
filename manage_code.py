#!/usr/bin/env python3
import os
import re
import sys
import argparse
import subprocess
import difflib
from flask import Flask, request, render_template_string
import openai

# Ensure your OpenAI API key is set, e.g. via the OPENAI_API_KEY environment variable.
openai.api_key = os.getenv("OPENAI_API_KEY")

# Global variable for the file we are managing.
SOURCE_FILE = None

# A simple HTML template to mimic a chat interface.
HTML_TEMPLATE = '''
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
'''

# In-memory conversation history.
chat_history = []

def extract_code(text):
    """
    Extracts text enclosed in triple backticks (optionally with a language hint)
    and returns the contents. If no code block is found, returns the entire text.
    """
    match = re.search(r"```(?:\w+)?\n(.*?)```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text.strip()

def extract_commit_summary(text):
    """
    Looks for a line starting with "Commit Summary:" and returns the summary.
    """
    match = re.search(r"Commit Summary:\s*(.*)", text)
    if match:
        return match.group(1).strip()
    return None

def compute_diff(old_content, new_content):
    """
    Computes a unified diff between old_content and new_content.
    """
    old_lines = old_content.splitlines(keepends=True)
    new_lines = new_content.splitlines(keepends=True)
    diff_lines = list(difflib.unified_diff(old_lines, new_lines,
                                           fromfile='Before',
                                           tofile='After'))
    return ''.join(diff_lines)

def commit_changes(source_file, commit_message):
    """
    Stages the file and commits changes to git with the provided commit message.
    """
    try:
        subprocess.run(["git", "add", source_file], check=True)
        subprocess.run(["git", "commit", "-m", commit_message], check=True)
        return True
    except subprocess.CalledProcessError:
        return False

def build_messages(system_prompt, chat_history):
    """
    Constructs the messages list for the API call, including system prompt and full conversation history.
    Converts role names to lowercase.
    """
    messages = [{"role": "system", "content": system_prompt}]
    for msg in chat_history:
        # Ensure roles are lowercase ('user' or 'assistant')
        role = msg["role"].lower()
        messages.append({"role": role, "content": msg["content"]})
    return messages

# Create the Flask app.
app = Flask(__name__)

@app.route("/", methods=["GET", "POST"])
def index():
    global chat_history, SOURCE_FILE

    if request.method == "POST":
        user_prompt = request.form["prompt"]
        chat_history.append({"role": "User", "content": user_prompt})

        # Determine if this is the first request (i.e. file is empty or non-existent).
        first_request = not os.path.exists(SOURCE_FILE) or os.path.getsize(SOURCE_FILE) == 0

        if first_request:
            system_prompt = (
                "You are an assistant that helps manage a software project. "
                "When given a prompt, generate the complete code for the project file. "
                "Output only the code in a single code block (using triple backticks) without any commentary."
            )
        else:
            system_prompt = (
                "You are an assistant that helps manage a software project. "
                "The file already has content. When given a prompt for changes, generate the complete updated file contents. "
                "Output only the updated code in a single code block (using triple backticks). "
                "Then, on a new line after the code block, output a commit summary starting with 'Commit Summary:' "
                "followed by a brief description of the changes."
            )

        # Build the conversation messages (maintaining full context).
        messages = build_messages(system_prompt, chat_history)

        try:
            response = openai.ChatCompletion.create(
                model="o1-mini",
                messages=messages,
                temperature=0
            )
        except Exception as e:
            chat_history.append({"role": "Assistant", "content": f"Error calling OpenAI API: {str(e)}"})
            return render_template_string(HTML_TEMPLATE, history=chat_history)

        reply = response.choices[0].message.content
        chat_history.append({"role": "Assistant", "content": reply})

        # Extract the complete new file contents from the API response.
        new_file_content = extract_code(reply)
        commit_summary = extract_commit_summary(reply)

        if first_request:
            # Write the complete code to the file.
            with open(SOURCE_FILE, "w") as f:
                f.write(new_file_content)
        else:
            # Read the current content.
            with open(SOURCE_FILE, "r") as f:
                old_content = f.read()
            # Compute the diff.
            diff_text = compute_diff(old_content, new_file_content)
            if diff_text:
                # Overwrite the file with the new content.
                with open(SOURCE_FILE, "w") as f:
                    f.write(new_file_content)
                # Use commit summary from the API if provided; otherwise, a default message.
                commit_msg = commit_summary if commit_summary else f"Applied changes: {user_prompt}"
                if not commit_changes(SOURCE_FILE, commit_msg):
                    chat_history.append({"role": "Assistant", "content": "Error committing changes to git."})
            else:
                chat_history.append({"role": "Assistant", "content": "No changes detected."})

        return render_template_string(HTML_TEMPLATE, history=chat_history)

    return render_template_string(HTML_TEMPLATE, history=chat_history)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manage a software project via ChatGPT API.")
    parser.add_argument("source_file", help="Path to the source code file to manage.")
    args = parser.parse_args()

    SOURCE_FILE = args.source_file
    # Create an empty file if it doesn't exist.
    if not os.path.exists(SOURCE_FILE):
        open(SOURCE_FILE, "w").close()

    # Start the Flask web server on port 5000.
    app.run(port=5000)

