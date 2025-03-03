let activeFile = null;
let openFiles = {};
let editor = null;
let openDirectories = new Set();
let fileCodingContexts = {}; // Mapping of filename to contexts
let allCodingContexts = []; // All available coding contexts
let lastSearchQuery = '';
let searchCursor = null;
let searchDirection = 'forward'; // New variable to track search direction
let totalSearchResults = 0;
let currentSearchIndex = 0;
let searchResults = []; // Array to store all search match positions

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
      },
      "Ctrl-F": function(cm) {
        openSearchOverlay(cm);
      }
    }
  });
}

// Function to open search overlay
function openSearchOverlay(cm) {
  let overlay = document.getElementById('searchOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'searchOverlay';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'searchInput';
    searchInput.placeholder = 'Search...';

    const searchButton = document.createElement('button');
    searchButton.id = 'searchButton';
    searchButton.textContent = 'Search';
    searchButton.addEventListener('click', () => {
      const query = searchInput.value.trim();
      if (query) {
        if (query !== lastSearchQuery) {
          lastSearchQuery = query;
          searchResults = [];
          currentSearchIndex = 0;
          searchCursor = null;
        }
        searchDirection = 'forward'; // Default search direction
        performSearch(cm, query, searchDirection);
        updateSearchIndicator();
      }
    });

    const closeButton = document.createElement('span');
    closeButton.id = 'closeSearchButton';
    closeButton.textContent = '✖';
    closeButton.title = 'Close Search';
    closeButton.addEventListener('click', () => {
      overlay.style.display = 'none';
      overlay.classList.remove('no-results');
      searchInput.value = '';
      lastSearchQuery = '';
      searchCursor = null;
      searchDirection = 'forward';
      searchResults = [];
      currentSearchIndex = 0;
      updateSearchIndicator();
    });

    // Create search indicator
    const searchIndicator = document.createElement('span');
    searchIndicator.id = 'searchIndicator';
    searchIndicator.textContent = '0 / 0';

    // Add event listeners for input change and key presses
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim();
      if (query) {
        if (query !== lastSearchQuery) {
          lastSearchQuery = query;
          searchResults = [];
          currentSearchIndex = 0;
          searchCursor = null;
        }
        performSearch(cm, query, searchDirection);
        updateSearchIndicator();
      } else {
        overlay.classList.remove('no-results');
        searchResults = [];
        currentSearchIndex = 0;
        updateSearchIndicator();
      }
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
          if (e.shiftKey) {
            searchDirection = 'reverse';
          } else {
            searchDirection = 'forward';
          }
          performSearch(cm, query, searchDirection);
          updateSearchIndicator();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        overlay.style.display = 'none';
        overlay.classList.remove('no-results');
        searchInput.value = '';
        lastSearchQuery = '';
        searchCursor = null;
        searchDirection = 'forward';
        searchResults = [];
        currentSearchIndex = 0;
        updateSearchIndicator();
      }
    });

    overlay.appendChild(searchInput);
    overlay.appendChild(searchButton);
    overlay.appendChild(closeButton);
    overlay.appendChild(searchIndicator);

    document.getElementById('sourceCodeContainer').appendChild(overlay);
  }

  overlay.style.display = 'flex';
  overlay.classList.remove('no-results');
  overlay.querySelector('#searchInput').focus();
}

// Function to perform search using CodeMirror's search addon
function performSearch(cm, query, direction = 'forward') {
  const doc = cm.getDoc();

  if (query !== lastSearchQuery || searchResults.length === 0) {
    // Reset search results
    searchResults = [];
    let cursor = doc.getSearchCursor(query, { line: 0, ch: 0 });
    while (cursor.findNext()) {
      searchResults.push({ from: cursor.from(), to: cursor.to() });
    }
    totalSearchResults = searchResults.length;
    currentSearchIndex = 0;
  }

  if (totalSearchResults === 0) {
    const overlay = document.getElementById('searchOverlay');
    if (overlay) {
      overlay.classList.add('no-results');
    }
    updateSearchIndicator();
    return;
  }

  if (direction === 'forward') {
    currentSearchIndex++;
    if (currentSearchIndex > totalSearchResults) {
      currentSearchIndex = 1; // Wrap around to first match
    }
  } else {
    currentSearchIndex--;
    if (currentSearchIndex < 1) {
      currentSearchIndex = totalSearchResults; // Wrap around to last match
    }
  }

  const match = searchResults[currentSearchIndex - 1];
  if (match) {
    doc.setSelection(match.from, match.to);
    cm.scrollIntoView({ from: match.from, to: match.to }, 100);
    const overlay = document.getElementById('searchOverlay');
    if (overlay) {
      overlay.classList.remove('no-results');
    }
  }

  updateSearchIndicator();
}

// Function to update the search indicator
function updateSearchIndicator() {
  const indicator = document.getElementById('searchIndicator');
  if (indicator) {
    indicator.textContent = `${currentSearchIndex} / ${totalSearchResults}`;
  }
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
          
      // Add Git Branch Display
      const gitBranchDiv = document.createElement('div');
      gitBranchDiv.id = 'gitBranchDisplay';
      gitBranchDiv.textContent = 'Loading branch...';
      gitBranchDiv.style.cursor = 'pointer';
      gitBranchDiv.addEventListener('click', openBranchPopup);
      projectBrowser.appendChild(gitBranchDiv);
          
      // /* 
      // CSS for Git Branch Display and Popup:
      // #gitBranchDisplay {
      //   padding: 10px;
      //   background-color: #f5f5f5;
      //   border-bottom: 1px solid #ddd;
      //   font-weight: bold;
      // }
      // #branchPopup {
      //   position: absolute;
      //   top: 50px;
      //   left: 10px;
      //   background-color: white;
      //   border: 1px solid #ccc;
      //   padding: 20px;
      //   box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      //   z-index: 1000;
      // }
      // #branchPopup.hidden {
      //   display: none;
      // }
      // #branchList {
      //   max-height: 200px;
      //   overflow-y: auto;
      // }
      // .branchItem {
      //   padding: 5px 0;
      //   cursor: pointer;
      // }
      // .branchItem:hover {
      //   background-color: #f0f0f0;
      // }
      // */
      
      // Add New File Button
      const newFileBtn = document.createElement('button');
      newFileBtn.id = 'newFileBtn';
      newFileBtn.textContent = 'New File';
      newFileBtn.addEventListener('click', openNewFileModal);
      projectBrowser.appendChild(newFileBtn);
    
      const treeContainer = document.createElement('div');
      createProjectTree(data, treeContainer);
      projectBrowser.appendChild(treeContainer);
          
      // Load open directories from localStorage before restoring
      loadOpenDirectories();
      // Restore open directories from localStorage
      restoreOpenDirectories(treeContainer);
          
      // Load Git Branch
      loadGitBranch();
    }
  } catch (e) {
    console.error('Error loading project structure:', e);
  }
}

// Function to load and display the current Git branch
async function loadGitBranch() {
  try {
    const response = await fetch('/git_current_branch');
    if (response.ok) {
      const data = await response.json();
      const gitBranchDiv = document.getElementById('gitBranchDisplay');
      gitBranchDiv.textContent = `${data.current_branch}`;
    } else {
      console.error('Failed to load current Git branch.');
    }
  } catch (e) {
    console.error('Error loading Git branch:', e);
  }
}

// Function to open the branch selection popup
async function openBranchPopup() {
  // Create popup container
  let popup = document.getElementById('branchPopup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'branchPopup';
    popup.className = 'hidden';
        
    // Branch list container
    const branchList = document.createElement('div');
    branchList.id = 'branchList';
    popup.appendChild(branchList);
        
    // Add Branch button
    const addBranchBtn = document.createElement('button');
    addBranchBtn.textContent = 'Add New Branch';
    addBranchBtn.addEventListener('click', showAddBranchInput);
    popup.appendChild(addBranchBtn);
        
    document.body.appendChild(popup);
  }
    
  // Toggle popup visibility
  popup.classList.toggle('hidden');
    
  if (!popup.classList.contains('hidden')) {
    // Fetch and display branches
    try {
      const response = await fetch('/git_branches');
      if (response.ok) {
        const data = await response.json();
        const branchList = document.getElementById('branchList');
        branchList.innerHTML = '';
        const currentBranch = document.getElementById('gitBranchDisplay').textContent;
        data.branches.forEach(branch => {
          const branchItem = document.createElement('div');
          branchItem.className = 'branchItem';
          if (branch === currentBranch) {
            branchItem.classList.add('active-branch');
          }
          branchItem.textContent = branch;
          branchItem.addEventListener('click', () => switchBranch(branch));
          branchList.appendChild(branchItem);
        });
      } else {
        console.error('Failed to load Git branches.');
      }
    } catch (e) {
      console.error('Error loading Git branches:', e);
    }
  }
}

// Function to switch to a selected branch
async function switchBranch(branchName) {
  try {
    const response = await fetch('/git_switch_branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch: branchName })
    });
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        alert(`Switched to branch ${branchName}`);
        loadGitBranch();
        await loadProjectStructure();
      } else {
        alert(`Error switching branch: ${data.error}`);
      }
    } else {
      console.error('Failed to switch branch.');
    }
  } catch (e) {
    console.error('Error switching branch:', e);
  }
    
  // Hide the popup after switching
  const popup = document.getElementById('branchPopup');
  if (popup) {
    popup.classList.add('hidden');
  }
}

// Function to show input for adding a new branch
function showAddBranchInput() {
  const branchList = document.getElementById('branchList');
      
  // Create input field
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'newBranchName';
  input.placeholder = 'Enter new branch name';
      
  // Create submit button
  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Create';
  submitBtn.addEventListener('click', addNewBranch);
      
  // Append to branch list
  branchList.appendChild(input);
  branchList.appendChild(submitBtn);
      
  // /* 
  // CSS for Add Branch Input:
  // #newBranchName {
  //   width: 100%;
  //   padding: 8px;
  //   margin-top: 10px;
  //   box-sizing: border-box;
  // }
  // */
}

// Function to add a new branch
async function addNewBranch() {
  const branchName = document.getElementById('newBranchName').value.trim();
  if (!branchName) {
    alert('Branch name cannot be empty.');
    return;
  }
    
  try {
    const response = await fetch('/git_create_branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch: branchName })
    });
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        alert(`Branch ${branchName} created successfully.`);
        loadGitBranch();
        // Refresh branch list
        openBranchPopup();
      } else {
        alert(`Error creating branch: ${data.error}`);
      }
    } else {
      console.error('Failed to create branch.');
    }
  } catch (e) {
    console.error('Error creating branch:', e);
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
    if (dir.name.startsWith('.')) {
      dirSpan.classList.add('hiddenfile');
    }
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
      adjustTabs(); // Adjust tabs when directories are toggled
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
    if (file.name.startsWith('.')) {
      fileSpan.classList.add('hiddenfile');
    }
    const fullPath = currentPath + file.name;
    fileSpan.addEventListener('click', () => {
      openFileInTab(fullPath);
    });
    itemDiv.appendChild(fileSpan);
    parentElement.appendChild(itemDiv);
  });
}

// Function to open a file in a new tab
async function openFileInTab(filename, activate = true) {
  // Check if the tab already exists in the DOM
  if (document.getElementById(`tab-${sanitizeId(filename)}`)) {
    if (activate) {
      await switchToTab(filename);
    }
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
      tab.id = `tab-${sanitizeId(filename)}`;
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
          
      tabs.insertBefore(tab, document.getElementById('moreTabs')); // Insert before 'moreTabs'
          
      if (activate) {
        // Deactivate other tabs
        Array.from(tabs.getElementsByClassName('tab')).forEach(t => {
          t.classList.remove('active');
        });
            
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
        // Load coding contexts
        loadFileCodingContexts(filename);
            
        adjustTabs(); // Adjust tabs after adding a new tab
    
        // Hide the "more tabs" dropdown
        const moreDropdown = document.querySelector('#moreTabs .dropdown-content');
        if (moreDropdown) {
          moreDropdown.classList.remove('show');
        }
      } else {
        openFiles[filename] = true;
        saveOpenFiles();
      }
    }
  } catch (e) {
    console.error('Error opening file:', e);
  }
}

// Function to sanitize filename for use in HTML IDs
function sanitizeId(filename) {
  return filename.replace(/[^a-zA-Z0-9-_]/g, '_');
}

// Function to switch to an existing tab
async function switchToTab(filename) {
  activeFile = filename;
  // Activate the selected tab
  const tabs = document.getElementById('tabs');
  Array.from(tabs.getElementsByClassName('tab')).forEach(t => {
    if (t.id === `tab-${sanitizeId(filename)}`) {
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
      // Load coding contexts
      loadFileCodingContexts(filename);
    }
  } catch (e) {
    console.error('Error switching tabs:', e);
  }
    
  // Hide the "more tabs" dropdown
  const moreDropdown = document.querySelector('#moreTabs .dropdown-content');
  if (moreDropdown) {
    moreDropdown.classList.remove('show');
  }
}

// Function to close a tab
function closeTab(filename) {
  const sanitizedId = sanitizeId(filename);
  const tab = document.getElementById(`tab-${sanitizedId}`);
  if (tab) {
    tab.parentNode.removeChild(tab);
    delete openFiles[filename];
    saveOpenFiles();
    // Remove coding contexts for the closed file
    delete fileCodingContexts[filename];
    saveFileCodingContexts();
    // If the closed tab was active, switch to another tab
    if (activeFile === filename) {
      const remainingTabs = document.querySelectorAll('#tabs .tab');
      if (remainingTabs.length > 0) {
        const newActiveTab = remainingTabs[remainingTabs.length - 1];
        const newActiveFilename = newActiveTab.textContent.slice(0, -1); // Remove close button
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
    adjustTabs(); // Adjust tabs after closing a tab
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

  // Create remove button
  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeCodingContext(context.name);
  });

  badgeSpan.appendChild(removeBtn);
  activeCodingContexts.appendChild(badgeSpan);
}

// Function to remove a coding context
function removeCodingContext(contextName) {
  if (!activeFile || !fileCodingContexts[activeFile]) return;
  // Remove from fileCodingContexts
  fileCodingContexts[activeFile] = fileCodingContexts[activeFile].filter(ctx => ctx.name !== contextName);
  if (fileCodingContexts[activeFile].length === 0) {
    delete fileCodingContexts[activeFile];
  }
  saveFileCodingContexts();
  // Remove from UI
  const badges = document.querySelectorAll('#activeCodingContexts .badge');
  badges.forEach(badge => {
    if (badge.firstChild.textContent === contextName) {
      badge.parentNode.removeChild(badge);
    }
  });
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
    // Load coding contexts for the active file from localStorage
    loadFileCodingContexts(filename);
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
  const sourceCodeContainer = document.getElementById("sourceCodeContainer");
      
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
        loadFileCodingContexts(activeFile);
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
    
  // Add event listener for new file form
  const newFileForm = document.getElementById("newFileForm");
  newFileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    createNewFile();
  });
    
  // Listen for Enter key in the new file name input
  const newFileNameInput = document.getElementById("newFileName");
  newFileNameInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      newFileForm.dispatchEvent(new Event("submit", {cancelable: true}));
    }
  });
    
  // Setup coding contexts UI
  if (sourceCodeContainer) {
    // Create container for coding contexts
    let contextsContainer = document.getElementById('codingContextsContainer');
    if (!contextsContainer) {
      contextsContainer = document.createElement('div');
      contextsContainer.id = 'codingContextsContainer';
      sourceCodeContainer.style.position = 'relative'; // Ensure positioning
      sourceCodeContainer.appendChild(contextsContainer);
    }
    
    // Create selector for adding contexts
    let contextSelector = document.getElementById('contextSelector');
    if (!contextSelector) {
      contextSelector = document.createElement('select');
      contextSelector.id = 'contextSelector';
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Add Context';
      contextSelector.appendChild(defaultOption);
          
      // Options will be populated based on allCodingContexts
      contextSelector.addEventListener('change', addCodingContext);
      contextsContainer.appendChild(contextSelector);
    }
  }

  // Global keydown listener for Ctrl+F
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      openSearchOverlay(editor);
    }
  });
}

// Function to load coding contexts for the active file from localStorage
function loadFileCodingContexts(filename) {
  const contextsContainer = document.getElementById('activeCodingContexts');
  if (!contextsContainer) return;

  // Clear existing badges to ensure the list is empty
  contextsContainer.innerHTML = '';

  const contexts = fileCodingContexts[filename] || [];
  
  // Only populate the list if there are assigned contexts
  contexts.forEach(ctx => {
    appendCodingContext(ctx);
  });
  scrollToBottom(contextsContainer);
}

// Function to update context selector options based on allCodingContexts
function updateContextSelectorOptions() {
  const contextSelector = document.getElementById('contextSelector');
  if (contextSelector) {
    // Remove existing options except the default
    while (contextSelector.options.length > 1) {
      contextSelector.remove(1);
    }
    // Add fetched contexts
    allCodingContexts.forEach(ctx => {
      const option = document.createElement('option');
      option.value = ctx.name;
      option.textContent = ctx.name;
      contextSelector.appendChild(option);
    });
  }
}

// Function to add a coding context
function addCodingContext(event) {
  const selectedContextName = event.target.value;
  if (!selectedContextName) return;
    
  const selectedContext = allCodingContexts.find(ctx => ctx.name === selectedContextName);
  if (!selectedContext) return;
    
  if (!fileCodingContexts[activeFile]) {
    fileCodingContexts[activeFile] = [];
  }
    
  if (!fileCodingContexts[activeFile].some(ctx => ctx.name === selectedContextName)) {
    const newContext = { name: selectedContext.name, content: selectedContext.content };
    fileCodingContexts[activeFile].push(newContext);
    appendCodingContext(newContext);
    saveFileCodingContexts();
  }
    
  // Reset selector
  event.target.value = '';
}

// Save file coding contexts to localStorage
function saveFileCodingContexts() {
  localStorage.setItem('fileCodingContexts', JSON.stringify(fileCodingContexts));
}

// Load file coding contexts from localStorage
function loadFileCodingContextsFromStorage() {
  const storedContexts = localStorage.getItem('fileCodingContexts');
  if (storedContexts) {
    fileCodingContexts = JSON.parse(storedContexts);
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
  const newFileNameInput = document.getElementById("newFileName");
  newFileNameInput.focus();
    
  // Removed event listeners from here to prevent multiple registrations
}

function closeNewFileModal() {
  const modal = document.getElementById("newFileModal");
  modal.style.display = "none";
  document.getElementById("newFileName").value = "";
}

// Rest of the functions remain unchanged...

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
      await openFileInTab(filename, false);
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

// Function to adjust tabs for responsiveness
function adjustTabs() {
  const tabsContainer = document.getElementById('tabs');
  const moreTabs = document.getElementById('moreTabs');
  if (!moreTabs) {
    // Create 'moreTabs' dropdown if it doesn't exist
    const moreBtn = document.createElement('div');
    moreBtn.id = 'moreTabs';
    moreBtn.className = 'tab more-tabs';
    moreBtn.textContent = '>>';
    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown-content';
    moreBtn.appendChild(dropdown);
    tabsContainer.appendChild(moreBtn);
    
    // Toggle dropdown on click
    moreBtn.addEventListener('click', () => {
      dropdown.classList.toggle('show');
    });
    
    // Close the dropdown if the user clicks outside of it
    window.addEventListener('click', function(event) {
      if (!moreBtn.contains(event.target)) {
        dropdown.classList.remove('show');
      }
    });
  }
    
  const availableWidth = tabsContainer.clientWidth;
  let usedWidth = 0;
  const tabs = Array.from(tabsContainer.getElementsByClassName('tab')).filter(tab => tab.id !== 'moreTabs');
  const dropdown = document.querySelector('#moreTabs .dropdown-content');
  dropdown.innerHTML = ''; // Clear previous dropdown items
    
  tabs.forEach(tab => {
    tab.style.display = 'inline-block'; // Reset display
  });
    
  const moreBtn = document.getElementById('moreTabs');
  moreBtn.style.display = 'none';
    
  tabs.forEach(tab => {
    usedWidth += tab.offsetWidth;
    if (usedWidth > availableWidth - moreBtn.offsetWidth) {
      tab.style.display = 'none';
      // Create dropdown item with close button
      const dropdownItem = document.createElement('div');
      dropdownItem.className = 'dropdown-item';
    
      const tabName = document.createElement('span');
      tabName.textContent = tab.textContent.slice(0, -1); // Remove close button text
      dropdownItem.appendChild(tabName);
    
      const closeX = document.createElement('span');
      closeX.textContent = '×';
      closeX.className = 'close-btn';
      closeX.style.marginLeft = '8px';
      closeX.style.cursor = 'pointer';
      closeX.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.textContent.slice(0, -1));
      });
      dropdownItem.appendChild(closeX);
    
      dropdownItem.addEventListener('click', () => {
        switchToTab(tab.textContent.slice(0, -1)); // Remove close button text
        dropdown.classList.remove('show');
      });
    
      dropdown.appendChild(dropdownItem);
      moreBtn.style.display = 'inline-block';
    }
  });
    
  if (dropdown.children.length === 0) {
    moreBtn.style.display = 'none';
  }
}

// Listen to window resize to adjust tabs
window.addEventListener('resize', adjustTabs);

// On startup, load the project structure, initialize CodeMirror, set up event listeners, and restore state.
window.onload = async function() {
  initializeCodeMirror();
  loadFileCodingContextsFromStorage();
  
  // Fetch all coding contexts on load
  try {
    const response = await fetch('/coding_contexts');
    if (response.ok) {
      const data = await response.json();
      allCodingContexts = data; // Updated to handle array of context objects
      updateContextSelectorOptions();
    } else {
      console.error('Failed to fetch coding contexts.');
    }
  } catch (e) {
    console.error('Error fetching coding contexts:', e);
  }
  
  await loadProjectStructure();
  await loadOpenFiles();
  loadActiveFile();
  if (activeFile) {
    await switchToTab(activeFile);
  }
  setupEventListeners();
  adjustTabs(); // Initial adjustment
};