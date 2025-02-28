let activeFile = null;
let openFiles = {};
let editor = null;
let openDirectories = new Set();

// Initialize CodeMirror editor
function initializeCodeMirror() {
  const textarea = document.getElementById('sourceCode');
  editor = CodeMirror.fromTextArea(textarea, {
    mode: 'python',
    theme: 'dracula',
    lineNumbers: true,
    lineWrapping: true,
    tabSize: 4,
    indentUnit: 4,
    extraKeys: {
      "Ctrl-S": function(cm) {
        saveFile();
      }
    }
  });
}

// Save file function triggered by Ctrl+S
function saveFile() {
  if (!activeFile) return;
  const updatedContent = editor.getValue();
  fetch('/update_source', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: activeFile, content: updatedContent })
  })
  .then(response => response.json())
  .then(data => {
    if (data.message) {
      console.log(data.message);
    } else if (data.error) {
      console.error(data.error);
    }
  })
  .catch(error => {
    console.error('Error saving file:', error);
  });
}

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

// Function to load project structure and set up event listeners for files
async function loadProjectStructure() {
  try {
    const response = await fetch('/project_structure');
    if (response.ok) {
      const data = await response.json();
      const projectBrowser = document.getElementById('projectBrowser');
      projectBrowser.innerHTML = '<h2>Project Browser</h2>';
      // Add New File Button
      const newFileBtn = document.createElement('button');
      newFileBtn.id = 'newFileBtn';
      newFileBtn.textContent = 'New File';
      newFileBtn.addEventListener('click', openNewFileModal);
      projectBrowser.appendChild(newFileBtn);

      const treeContainer = document.createElement('div');
      createProjectTree(data, treeContainer);
      projectBrowser.appendChild(treeContainer);
      
      // Restore open directories from localStorage
      restoreOpenDirectories(treeContainer);
    }
  } catch (e) {
    console.error('Error loading project structure:', e);
  }
}

// Function to create the project tree
function createProjectTree(structure, parentElement, currentPath = '') {
  const directories = structure.filter(item => item.type === 'directory');
  const files = structure.filter(item => item.type === 'file');

  directories.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  directories.forEach(dir => {
    const itemDiv = document.createElement('div');
    const dirSpan = document.createElement('span');
    dirSpan.textContent = dir.name;
    dirSpan.addEventListener('click', () => {
      childContainer.classList.toggle('hidden');
      dirSpan.classList.toggle('open');
      const fullPath = currentPath + dir.name + '/';
      if (childContainer.classList.contains('hidden')) {
        openDirectories.delete(fullPath);
      } else {
        openDirectories.add(fullPath);
      }
      saveOpenDirectories();
    });
    itemDiv.className = 'directory';
    itemDiv.appendChild(dirSpan);
    const childContainer = document.createElement('div');
    childContainer.className = 'directory-children hidden';
    // Recursively create tree with updated path
    createProjectTree(dir.children, childContainer, currentPath + dir.name + '/');
    itemDiv.appendChild(childContainer);
    parentElement.appendChild(itemDiv);
  });

  files.forEach(file => {
    const itemDiv = document.createElement('div');
    const fileSpan = document.createElement('span');
    fileSpan.textContent = file.name;
    fileSpan.className = 'file';
    const fullPath = currentPath + file.name;
    fileSpan.addEventListener('click', () => {
      openFileInTab(fullPath);
    });
    itemDiv.appendChild(fileSpan);
    parentElement.appendChild(itemDiv);
  });
}

// Function to open a file in a new tab
async function openFileInTab(filename) {
  // Check if the tab already exists in the DOM
  if (document.getElementById(`tab-${filename}`)) {
    await switchToTab(filename);
    return;
  }

  try {
    const response = await fetch(`/source?file=${encodeURIComponent(filename)}`);
    if (response.ok) {
      const data = await response.json();
      // Create a new tab
      const tabs = document.getElementById('tabs');
      const tab = document.createElement('div');
      tab.className = 'tab';
      tab.id = `tab-${filename}`;
      tab.textContent = filename;
      const closeBtn = document.createElement('span');
      closeBtn.className = 'close-btn';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(filename);
      });
      tab.appendChild(closeBtn);
      // Add event listener to switch tab on click
      tab.addEventListener('click', () => {
        switchToTab(filename);
      });
      // Deactivate other tabs
      Array.from(tabs.getElementsByClassName('tab')).forEach(t => {
        t.classList.remove('active');
      });
      tabs.appendChild(tab);
      // Activate the new tab
      tab.classList.add('active');
      // Load content into CodeMirror editor
      document.getElementById('sourceCode').value = data.content;
      if (editor) {
        editor.setValue(data.content);
      }
      activeFile = filename;
      openFiles[filename] = true;
      saveOpenFiles();
      saveActiveFile();
      // Load transcript
      await loadTranscript(filename);
    }
  } catch (e) {
    console.error('Error opening file:', e);
  }
}

// Function to switch to an existing tab
async function switchToTab(filename) {
  activeFile = filename;
  // Activate the selected tab
  const tabs = document.getElementById('tabs');
  Array.from(tabs.getElementsByClassName('tab')).forEach(t => {
    if (t.id === `tab-${filename}`) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });
  saveActiveFile();
  // Load source code
  try {
    const response = await fetch(`/source?file=${encodeURIComponent(filename)}`);
    if (response.ok) {
      const data = await response.json();
      document.getElementById('sourceCode').value = data.content;
      if (editor) {
        editor.setValue(data.content);
      }
      // Load transcript
      await loadTranscript(filename);
    }
  } catch (e) {
    console.error('Error switching tabs:', e);
  }
}

// Function to close a tab
function closeTab(filename) {
  const tab = document.getElementById(`tab-${filename}`);
  if (tab) {
    tab.parentNode.removeChild(tab);
    delete openFiles[filename];
    saveOpenFiles();
    // If the closed tab was active, switch to another tab
    if (activeFile === filename) {
      const remainingTabs = document.getElementById('tabs').getElementsByClassName('tab');
      if (remainingTabs.length > 0) {
        const newActiveFilename = remainingTabs[remainingTabs.length - 1].id.replace('tab-', '');
        switchToTab(newActiveFilename);
      } else {
        activeFile = null;
        saveActiveFile();
        document.getElementById('sourceCode').value = '';
        if (editor) {
          editor.setValue('');
        }
        document.getElementById('chatBox').innerHTML = '';
        document.getElementById('commitSummaries').innerHTML = '';
        document.getElementById('activeCodingContexts').innerHTML = '';
      }
    }
  }
}

// Append a message to chatBox; content is rendered as Markdown.
function appendMessage(role, content) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'message';
  msgDiv.innerHTML = '<strong class="' + role + '">' + role + ':</strong><div>' + renderMarkdown(content) + '</div>';
  chatBox.appendChild(msgDiv);
}

// Append a commit summary to commitSummaries
function appendCommitSummary(summary) {
  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'commit-summary';
  summaryDiv.textContent = summary;
  commitSummaries.appendChild(summaryDiv);
}

// Append a coding context badge to activeCodingContexts
function appendCodingContext(context) {
  if (!context || !context.name) return;
  const badgeSpan = document.createElement('span');
  badgeSpan.className = 'badge';
  badgeSpan.textContent = context.name;
  if (context.content) {
    badgeSpan.title = context.content; // Tooltip with full content
  }
  activeCodingContexts.appendChild(badgeSpan);
}

// Scroll to the bottom of an element.
function scrollToBottom(element) {
  element.scrollTop = element.scrollHeight;
}

// Function to load the existing conversation transcript for a specific file from the server.
async function loadTranscript(filename) {
  try {
    const response = await fetch(`/transcript?file=${encodeURIComponent(filename)}`);
    if (response.ok) {
      const data = await response.json();
      document.getElementById('chatBox').innerHTML = '';
      document.getElementById('commitSummaries').innerHTML = '';
      document.getElementById('activeCodingContexts').innerHTML = '';
      data.forEach(msg => {
        if (msg.role.toLowerCase() === 'assistant') {
          const professionalMessage = extract_professional_message(msg.content);
          appendMessage(msg.role, professionalMessage);
          const commit = extract_commit_summary(msg.content);
          if (commit) {
            appendCommitSummary(commit);
          }
        } else {
          appendMessage(msg.role, msg.content);
        }
      });
      scrollToBottom(chatBox);
      scrollToBottom(commitSummaries);
    }
    // Load coding contexts
    const contextsResponse = await fetch('/coding_contexts');
    if (contextsResponse.ok) {
      const contextsData = await contextsResponse.json();
      activeCodingContexts.innerHTML = ""; // Prevent duplication
      if (contextsData && contextsData.length > 0) {
        contextsData.forEach(ctx => {
          appendCodingContext(ctx);
        });
        scrollToBottom(activeCodingContexts);
      }
    }
  } catch (e) {
    console.error('Error loading transcript or coding contexts:', e);
  }
}

// Function to extract commit summary
function extract_commit_summary(text) {
  const regex = /^Commit Summary:\s*(.+)/m;
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

// Function to extract the professional message before the code block.
function extract_professional_message(content) {
  const regex = /^(.*?)```/s;
  const match = content.match(regex);
  return match ? match[1].trim() : content.trim();
}

// Listen for Ctrl+Enter to submit the form.
function setupEventListeners() {
  const promptInput = document.getElementById("promptInput");
  const chatForm = document.getElementById("chatForm");
  const throbber = document.getElementById("throbber");
  const chatBox = document.getElementById("chatBox");
  const commitSummaries = document.getElementById("commitSummaries");
  const activeCodingContexts = document.getElementById("activeCodingContexts");

  promptInput.addEventListener("keydown", function(e) {
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      chatForm.dispatchEvent(new Event("submit", {cancelable: true}));
    }
  });

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeFile) return;
    const prompt = promptInput.value.trim();
    if (!prompt) return;
    appendMessage("User", prompt);
    scrollToBottom(chatBox);
    promptInput.value = "";
    throbber.style.display = "block";

    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt, file: activeFile })
      });
      if (response.ok) {
        const data = await response.json();
        document.getElementById('chatBox').innerHTML = '';
        document.getElementById('commitSummaries').innerHTML = '';
        document.getElementById('activeCodingContexts').innerHTML = '';
        data.forEach(msg => {
          if (msg.role.toLowerCase() === 'assistant') {
            const professionalMessage = extract_professional_message(msg.content);
            appendMessage(msg.role, professionalMessage);
            const commit = extract_commit_summary(msg.content);
            if (commit) {
              appendCommitSummary(commit);
            }
          } else {
            appendMessage(msg.role, msg.content);
          }
        });
        scrollToBottom(chatBox);
        scrollToBottom(commitSummaries);
        // Reload the source code after AI updates
        await loadSourceCode(activeFile);
        // Reload coding contexts
        await loadCodingContexts();
        // Reload project structure
        await loadProjectStructure();
      } else {
        console.error("Server error:", response.statusText);
      }
    } catch (error) {
      console.error("Fetch error:", error);
    }
    throbber.style.display = "none";
  });
}

// Function to load coding contexts
async function loadCodingContexts() {
  try {
    const response = await fetch('/coding_contexts');
    if (response.ok) {
      const data = await response.json();
      activeCodingContexts.innerHTML = ""; // Prevent duplication
      if (data && data.length > 0) {
        data.forEach(ctx => {
          appendCodingContext(ctx);
        });
        scrollToBottom(activeCodingContexts);
      }
    }
  } catch (e) {
    console.error('Error loading coding contexts:', e);
  }
}

// Function to load the existing source code content for a specific file into CodeMirror
async function loadSourceCode(filename) {
  try {
    const response = await fetch(`/source?file=${encodeURIComponent(filename)}`);
    if (response.ok) {
      const data = await response.json();
      document.getElementById('sourceCode').value = data.content;
      if (editor) {
        editor.setValue(data.content);
      }
    }
  } catch (e) {
    console.error('Error loading source code:', e);
  }
}

// Modal functionality
function openNewFileModal() {
  const modal = document.getElementById("newFileModal");
  modal.style.display = "block";
}

function closeNewFileModal() {
  const modal = document.getElementById("newFileModal");
  modal.style.display = "none";
  document.getElementById("newFileName").value = "";
}

async function createNewFile() {
  const fileName = document.getElementById("newFileName").value.trim();
  if (!fileName) {
    alert("File name cannot be empty.");
    return;
  }
  const response = await fetch("/create_file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: fileName })
  });
  const data = await response.json();
  if (data.success) {
    closeNewFileModal();
    await loadProjectStructure();
  } else {
    alert("Error creating file: " + data.error);
  }
}

// Close modal when clicking outside of it
window.onclick = function(event) {
  const modal = document.getElementById("newFileModal");
  if (event.target == modal) {
    closeNewFileModal();
  }
}

// Save open files to localStorage
function saveOpenFiles() {
  localStorage.setItem('openFiles', JSON.stringify(openFiles));
}

// Load open files from localStorage
async function loadOpenFiles() {
  const storedOpenFiles = localStorage.getItem('openFiles');
  if (storedOpenFiles) {
    openFiles = JSON.parse(storedOpenFiles);
    for (const filename of Object.keys(openFiles)) {
      await openFileInTab(filename);
    }
  }
}

// Save active file to localStorage
function saveActiveFile() {
  localStorage.setItem('activeFile', activeFile);
}

// Load active file from localStorage
function loadActiveFile() {
  const storedActiveFile = localStorage.getItem('activeFile');
  if (storedActiveFile) {
    activeFile = storedActiveFile;
  }
}

// Save open directories to localStorage
function saveOpenDirectories() {
  localStorage.setItem('openDirectories', JSON.stringify(Array.from(openDirectories)));
}

// Load open directories from localStorage
function loadOpenDirectories() {
  const storedOpenDirs = localStorage.getItem('openDirectories');
  if (storedOpenDirs) {
    openDirectories = new Set(JSON.parse(storedOpenDirs));
  }
}

// Restore open directories in the project tree
function restoreOpenDirectories(parentElement, currentPath = '') {
  const directories = parentElement.getElementsByClassName('directory');
  Array.from(directories).forEach(dir => {
    const dirName = dir.firstChild.textContent;
    const fullPath = currentPath + dirName + '/';
    if (openDirectories.has(fullPath)) {
      const childContainer = dir.querySelector('.directory-children');
      if (childContainer) {
        childContainer.classList.remove('hidden');
        dir.firstChild.classList.add('open');
        restoreOpenDirectories(childContainer, fullPath);
      }
    }
  });
}

// On startup, load the project structure, initialize CodeMirror, set up event listeners, and restore state.
window.onload = async function() {
  initializeCodeMirror();
  loadOpenDirectories();
  await loadProjectStructure();
  await loadOpenFiles();
  loadActiveFile();
  if (activeFile) {
    await switchToTab(activeFile);
  }
  setupEventListeners();
};