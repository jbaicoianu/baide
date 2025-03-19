let activeFile = {}; // Mapping of project name to active file
let openFiles = {}; // Mapping of project name to open files
let editor = null;
let openDirectories = new Map(); // Mapping of project name to open directories
let fileCodingContexts = {}; // Mapping of filename to contexts
let allCodingContexts = []; // All available coding contexts
let fileActiveModels = {}; // Mapping of filename to active model
let availableModels = []; // List of available AI models
let defaultModel = ''; // Default AI model
let lastSearchQuery = '';
let searchCursor = null;
let searchDirection = 'forward'; // New variable to track search direction
let totalSearchResults = 0;
let currentSearchIndex = 0;
let searchResults = []; // Array to store all search match positions
let currentProject = ''; // Variable to track the current project

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
        promptCommitMessage();
      },
      "Ctrl-F": function(cm) {
        openSearchOverlay(cm);
      },
      "Ctrl-G": function(cm) { // Added Ctrl+G shortcut for forward search
        if (lastSearchQuery) {
          performSearch(cm, lastSearchQuery, 'forward');
          updateSearchIndicator();
        }
      },
      "Ctrl-Shift-G": function(cm) { // Added Ctrl+Shift-G shortcut for backward search
        if (lastSearchQuery) {
          performSearch(cm, lastSearchQuery, 'reverse');
          updateSearchIndicator();
        }
      }
    }
  });
}

// Function to set editor value and refresh
function setEditorValue(value) {
  if (editor) {
    editor.setValue(value);
    setTimeout(() => {
      editor.refresh();
    }, 10); // Adjust the timeout as needed
  }
}

// Function to clear the editor content
function clearEditor() {
  setEditorValue('');
}

// Function to prompt for commit message
function promptCommitMessage() {
  // Create overlay if it doesn't exist
  let overlay = document.getElementById('commitMessageOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'commitMessageOverlay';

    const box = document.createElement('div');
    box.id = 'commitMessageBox';

    const title = document.createElement('h2');
    title.textContent = 'Commit Message';
    box.appendChild(title);

    const textarea = document.createElement('textarea');
    textarea.id = 'commitMessageInput';
    textarea.placeholder = 'Enter commit message...';
    box.appendChild(textarea);

    // Add keydown event listener for Ctrl+Enter and Esc
    textarea.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    });

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'buttons';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      const message = textarea.value.trim();
      if (message) {
        overlay.style.display = 'none';
        saveFile(message);
      } else {
        showToast('Commit message cannot be empty.', 'error');
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      overlay.style.display = 'none';
    });

    buttonsDiv.appendChild(cancelBtn);
    buttonsDiv.appendChild(saveBtn);
    box.appendChild(buttonsDiv);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // Show the overlay
  overlay.style.display = 'flex';
  document.getElementById('commitMessageInput').focus();
}

// Save file function triggered by Ctrl+S with commit message
function saveFile(commitMessage) {
  if (!currentProject || !activeFile[currentProject]) return;
  const filename = activeFile[currentProject];
  const updatedContent = editor.getValue();
  fetch('/update_source', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: filename, content: updatedContent, commit_message: commitMessage, project_name: currentProject })
  })
  .then(response => response.json())
  .then(data => {
    if (data.message) {
      showToast(data.message, 'success');
    } else if (data.error) {
      showToast(data.error, 'error');
    }
    if (data.chat_history) {
      updateChatHistoryViewer(data.chat_history);
    }
  })
  .catch(error => {
    showToast('Error saving file.', 'error');
    console.error('Error saving file:', error);
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
  const caseInsensitive = true; // Enable case insensitive search

  if (query !== lastSearchQuery || searchResults.length === 0) {
    // Reset search results
    searchResults = [];
    const searchOptions = { line: 0, ch: 0 };
    let cursor = doc.getSearchCursor(query, searchOptions);
    while (cursor.findNext()) {
      const from = cursor.from();
      const to = cursor.to();
      // Adjust for case insensitivity
      const matchedText = doc.getRange(from, to).toLowerCase();
      if (matchedText === query.toLowerCase()) {
        searchResults.push({ from, to });
      }
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
    const response = await fetch(`/projects/details?project_name=${encodeURIComponent(currentProject)}`);
    if (response.ok) {
      const data = await response.json();
      const projectBrowser = document.getElementById('projectBrowser');
      projectBrowser.innerHTML = '<h2>Project Browser</h2>';
          
      // Add Project Selector
      addProjectSelector(projectBrowser);
      
      // Add New Project Button
      const newProjectBtn = document.createElement('button');
      newProjectBtn.id = 'newProjectBtn';
      newProjectBtn.textContent = 'New Project';
      newProjectBtn.addEventListener('click', openNewProjectModal);
      projectBrowser.appendChild(newProjectBtn);
      
      // Add Git Branch Display
      const gitBranchDiv = document.createElement('div');
      gitBranchDiv.id = 'gitBranchDisplay';
      gitBranchDiv.textContent = 'Loading branch...';
      gitBranchDiv.style.cursor = 'pointer';
      gitBranchDiv.addEventListener('click', openBranchPopup);
      projectBrowser.appendChild(gitBranchDiv);
          
      // Add New File Button
      const newFileBtn = document.createElement('button');
      newFileBtn.id = 'newFileBtn';
      newFileBtn.textContent = 'New File';
      newFileBtn.addEventListener('click', openNewFileModal);
      projectBrowser.appendChild(newFileBtn);
    
      // Since the new response format does not include the project structure,
      // fetch the project structure separately if needed
      // For demonstration, assuming another endpoint '/projects/structure'
      const structureResponse = await fetch(`/projects/structure?project_name=${encodeURIComponent(currentProject)}`);
      if (structureResponse.ok) {
        const structureData = await structureResponse.json();
        const treeContainer = document.createElement('div');
        createProjectTree(structureData, treeContainer);
        projectBrowser.appendChild(treeContainer);
      } else {
        showToast('Failed to load project structure.', 'error');
        console.error('Failed to load project structure.');
      }
          
      // Load open directories from localStorage before restoring
      loadOpenDirectories();
      // Restore open directories from localStorage
      const treeContainer = projectBrowser.querySelector('div');
      if (treeContainer) {
        restoreOpenDirectories(treeContainer);
      }
          
      // Load Git Branch
      loadGitBranch();

      // Check if there are no open files and show placeholder if necessary
      if (!activeFile[currentProject] || Object.keys(openFiles[currentProject]).length === 0) {
        showPlaceholderPage();
      } else {
        hidePlaceholderPage();
      }
    } else {
      showToast('Failed to fetch project details.', 'error');
      console.error('Failed to fetch project details.');
    }
  } catch (e) {
    showToast('Error loading project structure.', 'error');
    console.error('Error loading project structure:', e);
  }
}

// Function to add Project Selector to the Project Browser
function addProjectSelector(parentElement) {
  const selector = document.createElement('select');
  selector.id = 'projectSelector';
  
  // Fetch all projects
  fetch('/projects/list')
    .then(response => response.json())
    .then(data => {
      const projects = data.projects; // Adjusted to access the 'projects' array
      
      // Add a default option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Select Project';
      selector.appendChild(defaultOption);
      
      projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project;
        option.textContent = project;
        selector.appendChild(option);
      });
      
      // Set the current project as selected
      selector.value = currentProject;
    })
    .catch(error => {
      console.error('Error fetching project list:', error);
    });
  
  // Add event listener for project change
  selector.addEventListener('change', (e) => {
    const selectedProject = e.target.value;
    if (selectedProject) {
      switchProject(selectedProject);
    }
  });
  
  parentElement.insertBefore(selector, parentElement.firstChild);
}

// Function to switch projects
async function switchProject(projectName) {
  // Save current project state
  if (currentProject) {
    saveProjectState(currentProject);
  }

  // Clear the editor to prevent residual code
  clearEditor();

  try {
    const response = await fetch(`/projects/details?project_name=${encodeURIComponent(projectName)}`);
    if (response.ok) {
      currentProject = projectName;
      // Save current project to localStorage
      localStorage.setItem('currentProject', currentProject);
      // Reload project structure
      await loadProjectStructure();
      // Restore new project state
      await restoreProjectState(currentProject);

      // Check if there are no open files and show placeholder if necessary
      if (!activeFile[currentProject] || Object.keys(openFiles[currentProject]).length === 0) {
        showPlaceholderPage();
      } else {
        hidePlaceholderPage();
      }
    } else {
      showToast('Failed to switch project.', 'error');
      console.error('Failed to switch project.');
    }
  } catch (e) {
    showToast('Error switching project.', 'error');
    console.error('Error switching project:', e);
  }
}

// Function to save the state of a project
function saveProjectState(projectName) {
  // Save open files
  localStorage.setItem(`openFiles_${projectName}`, JSON.stringify(openFiles[projectName] || {}));
  // Save active file
  localStorage.setItem(`activeFile_${projectName}`, activeFile[projectName] || '');
  // Save open directories
  localStorage.setItem(`openDirectories_${projectName}`, JSON.stringify(Array.from(openDirectories.get(projectName) || [])));
}

// Function to restore the state of a project
async function restoreProjectState(projectName) {
  // Load open files
  const storedOpenFiles = localStorage.getItem(`openFiles_${projectName}`);
  openFiles[projectName] = storedOpenFiles ? JSON.parse(storedOpenFiles) : {};

  // Load active file
  activeFile[projectName] = localStorage.getItem(`activeFile_${projectName}`) || '';

  // Load open directories
  const storedOpenDirs = localStorage.getItem(`openDirectories_${projectName}`);
  openDirectories.set(projectName, storedOpenDirs ? new Set(JSON.parse(storedOpenDirs)) : new Set());

  // Close all current tabs
  closeAllTabs();

  // Open files for the new project
  for (const filename of Object.keys(openFiles[projectName])) {
    await openFileInTab(filename, false);
  }

  // Switch to active file
  if (activeFile[projectName]) {
    await switchToTab(activeFile[projectName]);
  } else {
    // If no active file, clear the editor and show placeholder
    clearEditor();
    showPlaceholderPage();
  }

  adjustTabs(); // Adjust tabs after restoring
}

// Function to close all open tabs
function closeAllTabs() {
  const tabs = document.getElementById('tabs');
  if (tabs) {
    Array.from(tabs.getElementsByClassName('tab')).forEach(tab => {
      const filename = tab.textContent.slice(0, -1); // Remove close button
      closeTab(filename);
    });
  }
}

// Function to load current project from localStorage
function loadCurrentProject() {
  const storedProject = localStorage.getItem('currentProject');
  if (storedProject) {
    currentProject = storedProject;
  } else {
    // If no project is selected, you might want to select a default or prompt the user
    fetch('/projects/list')
      .then(response => response.json())
      .then(data => {
        const projects = data.projects;
        if (projects.length > 0) {
          switchProject(projects[0]);
        } else {
          // No projects available, show placeholder
          showPlaceholderPage();
        }
      })
      .catch(error => {
        console.error('Error fetching project list:', error);
      });
  }
}

// Function to load and display the current Git branch
async function loadGitBranch() {
  try {
    const response = await fetch('/git_current_branch?project_name=' + currentProject);
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
      const response = await fetch('/git_branches?project_name=' + currentProject);
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
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ branch: branchName, project_name: currentProject })
    });
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        showToast(`Switched to branch ${branchName}`, 'success');
        loadGitBranch();
        await loadProjectStructure();
      } else {
        showToast(`Error switching branch: ${data.error}`, 'error');
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
      
  // Automatically focus on the new branch name input box
  input.focus();
  
  // Add event listener for Enter key to submit the branch
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addNewBranch();
    }
  });
    
  /*
  CSS for Add Branch Input:
  #newBranchName {
    width: 100%;
    padding: 8px;
    margin-top: 10px;
    box-sizing: border-box;
  }
  */
}

// Function to add a new branch
async function addNewBranch() {
  const branchName = document.getElementById('newBranchName').value.trim();
  if (!branchName) {
    showToast('Branch name cannot be empty.', 'error');
    return;
  }
    
  try {
    const response = await fetch('/git_create_branch', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ branch: branchName, project_name: currentProject })
    });
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        showToast(`Branch ${branchName} created successfully.`, 'success');
        loadGitBranch();
        // Refresh branch list
        openBranchPopup();
      } else {
        showToast(`Error creating branch: ${data.error}`, 'error');
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
        openDirectories.get(currentProject).delete(fullPath);
      } else {
        openDirectories.get(currentProject).add(fullPath);
      }
      saveOpenDirectories(currentProject);
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
  if (!currentProject) return;

  // Initialize openFiles for the project if not present
  if (!openFiles[currentProject]) {
    openFiles[currentProject] = {};
  }

  // Check if the tab already exists in the DOM
  if (document.getElementById(`tab-${sanitizeId(filename)}`)) {
    if (activate) {
      await switchToTab(filename);
    }
    return;
  }
    
  try {
    const response = await fetch(`/source?file=${encodeURIComponent(filename)}&project_name=${encodeURIComponent(currentProject)}`);
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
        setEditorValue(data.content);
        activeFile[currentProject] = filename;
        openFiles[currentProject][filename] = true;
        saveOpenFiles(currentProject);
        saveActiveFile(currentProject);
        // Load transcript
        await loadTranscript(filename);
        // Load coding contexts
        loadFileCodingContexts(filename);
        // Load active AI model
        loadFileActiveModel(filename);
        // Adjust tabs
        adjustTabs(); // Adjust tabs after adding a new tab
    
        // Hide the "more tabs" dropdown
        const moreDropdown = document.querySelector('#moreTabs .dropdown-content');
        if (moreDropdown) {
          moreDropdown.classList.remove('show');
        }
        
        // Hide the placeholder if it's visible
        hidePlaceholderPage();
      } else {
        openFiles[currentProject][filename] = true;
        saveOpenFiles(currentProject);
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
  if (!currentProject) return;

  activeFile[currentProject] = filename;
  // Save active file
  saveActiveFile(currentProject);

  // Activate the selected tab
  const tabs = document.getElementById('tabs');
  Array.from(tabs.getElementsByClassName('tab')).forEach(t => {
    if (t.id === `tab-${sanitizeId(filename)}`) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  // Clear the editor before loading new content
  clearEditor();

  // Load source code
  try {
    const response = await fetch(`/source?file=${encodeURIComponent(filename)}&project_name=${encodeURIComponent(currentProject)}`);
    if (response.ok) {
      const data = await response.json();
      setEditorValue(data.content);
      // Load transcript
      await loadTranscript(filename);
      // Load coding contexts
      loadFileCodingContexts(filename);
      // Load active AI model
      loadFileActiveModel(filename);
    }
  } catch (e) {
    console.error('Error switching tabs:', e);
  }
    
  // Hide the "more tabs" dropdown
  const moreDropdown = document.querySelector('#moreTabs .dropdown-content');
  if (moreDropdown) {
    moreDropdown.classList.remove('show');
  }

  // Hide the placeholder if it's visible
  hidePlaceholderPage();
}

// Function to close a tab
function closeTab(filename) {
  if (!currentProject) return;

  const sanitizedId = sanitizeId(filename);
  const tab = document.getElementById(`tab-${sanitizedId}`);
  if (tab) {
    tab.parentNode.removeChild(tab);
    delete openFiles[currentProject][filename];
    saveOpenFiles(currentProject);
    // Remove coding contexts for the closed file
    delete fileCodingContexts[filename];
    saveFileCodingContexts();
    // Remove active model for the closed file
    delete fileActiveModels[filename];
    saveFileActiveModels();
    // If the closed tab was active, switch to another tab
    if (activeFile[currentProject] === filename) {
      const remainingTabs = document.querySelectorAll(`#tabs .tab`);
      if (remainingTabs.length > 0) {
        const newActiveTab = remainingTabs[remainingTabs.length - 1];
        const newActiveFilename = newActiveTab.textContent.slice(0, -1); // Remove close button
        switchToTab(newActiveFilename);
      } else {
        activeFile[currentProject] = undefined;
        saveActiveFile(currentProject);
        setEditorValue('');
        if (editor) {
          editor.setValue('');
        }
        document.getElementById('chatBox').innerHTML = '';
        document.getElementById('commitSummaries').innerHTML = '';
        document.getElementById('activeCodingContexts').innerHTML = '';
        // Reset AI model dropdown
        resetAIDropdown();
        // Show the placeholder page since there are no open files
        showPlaceholderPage();
      }
      adjustTabs(); // Adjust tabs after closing a tab
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
  if (!currentProject || !activeFile[currentProject] || !fileCodingContexts[activeFile[currentProject]]) return;
  const filename = activeFile[currentProject];
  // Remove from fileCodingContexts
  fileCodingContexts[filename] = fileCodingContexts[filename].filter(ctx => ctx.name !== contextName);
  if (fileCodingContexts[filename].length === 0) {
    delete fileCodingContexts[filename];
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
    const response = await fetch(`/transcript?file=${encodeURIComponent(filename)}&project_name=${encodeURIComponent(currentProject)}`);
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
    if (!currentProject || !activeFile[currentProject]) return;
    const filename = activeFile[currentProject];
    const prompt = promptInput.value.trim();
    if (!prompt) return;
    appendMessage("User", prompt);
    scrollToBottom(chatBox);
    promptInput.value = "";
    throbber.style.display = "block";
    
    // Gather active context names
    const contexts = fileCodingContexts[filename] ? fileCodingContexts[filename].map(ctx => ctx.name) : [];
    
    // Get active AI model for the current file
    const activeModel = fileActiveModels[filename] || defaultModel;
    
    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt, file: filename, contexts: contexts, model: activeModel, project_name: currentProject })
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
        await loadSourceCode(filename);
        // Reload coding contexts
        loadFileCodingContexts(filename);
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
      
      // Call updateContextSelectorOptions if allCodingContexts is not null
      if (allCodingContexts != null) {
        updateContextSelectorOptions();
      }
    }
  }

  // Create AI Model Dropdown in chat container
  createAIDropdown();

  // Global keydown listener for Ctrl+F
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      openSearchOverlay(editor);
    }
  });
}

// Function to create AI Model Dropdown
function createAIDropdown() {
  const chatBox = document.getElementById('chatBox');
  if (!chatBox) return;

  // Create container for dropdown
  let aiDropdownContainer = document.getElementById('aiModelDropdownContainer');
  if (!aiDropdownContainer) {
    aiDropdownContainer = document.createElement('div');
    aiDropdownContainer.id = 'aiModelDropdownContainer';
    aiDropdownContainer.className = 'ai-model-dropdown';

    const modelSelect = document.createElement('select');
    modelSelect.id = 'aiModelSelect';

    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Loading models...';
    modelSelect.appendChild(defaultOption);

    // Add event listener for model change
    modelSelect.addEventListener('change', (e) => {
      const selectedModel = e.target.value;
      if (currentProject && activeFile[currentProject]) {
        fileActiveModels[activeFile[currentProject]] = selectedModel;
        saveFileActiveModels();
      }
    });

    aiDropdownContainer.appendChild(modelSelect);
    chatBox.parentElement.style.position = 'relative'; // Ensure positioning
    chatBox.parentElement.appendChild(aiDropdownContainer);
  }
}

// Function to reset AI Model Dropdown
function resetAIDropdown() {
  const modelSelect = document.getElementById('aiModelSelect');
  if (modelSelect) {
    modelSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'No file selected';
    modelSelect.appendChild(defaultOption);
  }
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

// Save file active models to localStorage
function saveFileActiveModels() {
  localStorage.setItem('fileActiveModels', JSON.stringify(fileActiveModels));
}

// Function to load the existing source code content for a specific file into CodeMirror
async function loadSourceCode(filename) {
  try {
    const response = await fetch(`/source?file=${encodeURIComponent(filename)}&project_name=${encodeURIComponent(currentProject)}`);
    if (response.ok) {
      const data = await response.json();
      setEditorValue(data.content);
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
async function createNewFile() {
  const fileName = document.getElementById("newFileName").value.trim();
  if (!fileName) {
    showToast("File name cannot be empty.", "error");
    return;
  }
  const response = await fetch("/create_file", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: fileName, project_name: currentProject })
  });
  const data = await response.json();
  if (data.success) {
    closeNewFileModal();
    await loadProjectStructure();
    await openFileInTab(fileName, true); // Added this line to open the new file in a new tab
    showToast(`File ${fileName} created successfully.`, "success");
  } else {
    showToast("Error creating file: " + data.error, "error");
  }
}
                                                      
// Function to open new project modal
function openNewProjectModal() {
  let overlay = document.getElementById('newProjectOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'newProjectOverlay';

    const box = document.createElement('div');
    box.id = 'newProjectBox';

    const title = document.createElement('h2');
    title.textContent = 'Create New Project';
    box.appendChild(title);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'newProjectName';
    input.placeholder = 'Enter project name...';
    box.appendChild(input);

    // Add keydown event listener for Ctrl+Enter and Esc
    input.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        createProjectBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelProjectBtn.click();
      }
    });

    const buttonsDiv = document.createElement('div');
    buttonsDiv.className = 'buttons';

    const createProjectBtn = document.createElement('button');
    createProjectBtn.className = 'create-btn';
    createProjectBtn.textContent = 'Create';
    createProjectBtn.addEventListener('click', () => {
      const projectName = input.value.trim();
      if (projectName) {
        overlay.style.display = 'none';
        createNewProject(projectName);
      } else {
        showToast('Project name cannot be empty.', 'error');
      }
    });

    const cancelProjectBtn = document.createElement('button');
    cancelProjectBtn.className = 'cancel-btn';
    cancelProjectBtn.textContent = 'Cancel';
    cancelProjectBtn.addEventListener('click', () => {
      overlay.style.display = 'none';
    });

    buttonsDiv.appendChild(cancelProjectBtn);
    buttonsDiv.appendChild(createProjectBtn);
    box.appendChild(buttonsDiv);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // Show the overlay
  overlay.style.display = 'flex';
  document.getElementById('newProjectName').focus();
}

// Function to close new project modal
function closeNewProjectModal() {
  const overlay = document.getElementById('newProjectOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    document.getElementById('newProjectName').value = '';
  }
}

// Function to create a new project
async function createNewProject(projectName) {
  try {
    const response = await fetch('/projects/add', { // Updated endpoint
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ project_name: projectName }) // Updated parameter
    });
    const data = await response.json();
    if (data.success) {
      showToast(`Project ${data.project} created successfully.`, 'success'); // Use data.project
      // Initialize storage for the new project
      openFiles[data.project] = {};
      activeFile[data.project] = '';
      openDirectories.set(data.project, new Set());
      // Save initial state
      saveProjectState(data.project);
      // Optionally switch to the new project
      switchProject(data.project); // Use data.project
    } else {
      showToast(`Error creating project: ${data.error}`, 'error');
    }
  } catch (e) {
    showToast('Error creating project.', 'error');
    console.error('Error creating project:', e);
  }
}

// Close modal when clicking outside of it
window.onclick = function(event) {
  const modal = document.getElementById("newFileModal");
  if (event.target == modal) {
    closeNewFileModal();
  }
  
  const projectModal = document.getElementById('newProjectOverlay');
  if (projectModal && event.target == projectModal) {
    closeNewProjectModal();
  }
}

// Save open files to localStorage
function saveOpenFiles(projectName) {
  localStorage.setItem(`openFiles_${projectName}`, JSON.stringify(openFiles[projectName]));
}

// Save active file to localStorage
function saveActiveFile(projectName) {
  localStorage.setItem(`activeFile_${projectName}`, activeFile[projectName] || '');
}

// Save open directories to localStorage
function saveOpenDirectories(projectName) {
  localStorage.setItem(`openDirectories_${projectName}`, JSON.stringify(Array.from(openDirectories.get(projectName) || [])));
}

// Load open directories from localStorage
function loadOpenDirectories() {
  if (!currentProject) return;
  const storedOpenDirs = localStorage.getItem(`openDirectories_${currentProject}`);
  if (storedOpenDirs) {
    const dirs = new Set(JSON.parse(storedOpenDirs));
    openDirectories.set(currentProject, dirs);
  } else {
    openDirectories.set(currentProject, new Set());
  }
}

// Restore open directories in the project tree
function restoreOpenDirectories(parentElement, currentPath = '') {
  const directories = parentElement.getElementsByClassName('directory');
  Array.from(directories).forEach(dir => {
    const dirName = dir.firstChild.textContent;
    const fullPath = currentPath + dirName + '/';
    if (openDirectories.get(currentProject).has(fullPath)) {
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
      tab.classList.add('hidden'); // Add 'hidden' class instead of display 'none'
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

// Function to show toast notifications
function showToast(message, type = 'info') {
  // Create toast container if it doesn't exist
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.style.position = 'fixed';
    toastContainer.style.bottom = '20px';
    toastContainer.style.right = '20px';
    toastContainer.style.zIndex = '10000';
    toastContainer.style.display = 'flex';
    toastContainer.style.flexDirection = 'column';
    toastContainer.style.gap = '10px';
    document.body.appendChild(toastContainer);
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  // Style the toast
  toast.style.minWidth = '200px';
  toast.style.padding = '10px 20px';
  toast.style.backgroundColor = type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : '#333';
  toast.style.color = 'white';
  toast.style.borderRadius = '5px';
  toast.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 0.5s';
  toast.style.cursor = 'pointer';

  // Append toast to container
  toastContainer.appendChild(toast);

  // Show the toast
  setTimeout(() => {
    toast.style.opacity = '1';
  }, 100);

  // Remove the toast after 5 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 500);
  }, 5000);

  // Allow manual removal on click
  toast.addEventListener('click', () => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 500);
  });
}

// On startup, load the project structure, initialize CodeMirror, set up event listeners, and restore state.
window.onload = async function() {
  initializeCodeMirror();
  loadFileCodingContextsFromStorage();
  loadFileActiveModelsFromStorage();
  
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

  setupEventListeners();
  
  // Load AI Models after creating the dropdown
  await loadAIModals();
  
  loadCurrentProject();
  await loadProjectStructure();
  await restoreProjectState(currentProject);
  adjustTabs(); // Initial adjustment

  // Check if there are no open files and show placeholder if necessary
  if (!activeFile[currentProject] || Object.keys(openFiles[currentProject]).length === 0) {
    showPlaceholderPage();
  } else {
    hidePlaceholderPage();
  }
};

// Function to add a coding context
function addCodingContext(event) {
  if (!currentProject || !activeFile[currentProject]) return;
  
  const selectedContextName = event.target.value;
  if (!selectedContextName) return;
    
  const selectedContext = allCodingContexts.find(ctx => ctx.name === selectedContextName);
  if (!selectedContext) return;
    
  const filename = activeFile[currentProject];
  if (!fileCodingContexts[filename]) {
    fileCodingContexts[filename] = [];
  }
    
  if (!fileCodingContexts[filename].some(ctx => ctx.name === selectedContextName)) {
    const newContext = { name: selectedContext.name, content: selectedContext.content };
    fileCodingContexts[filename].push(newContext);
    appendCodingContext(newContext);
    saveFileCodingContexts();
  }
    
  // Reset selector
  event.target.value = '';
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

// Function to load active AI models for all files from localStorage
function loadFileActiveModelsFromStorage() {
  const storedModels = localStorage.getItem('fileActiveModels');
  if (storedModels) {
    fileActiveModels = JSON.parse(storedModels);
  }
}

// Function to load and populate AI models on startup
async function loadAIModals() {
  try {
    const response = await fetch('/models');
    if (response.ok) {
      const data = await response.json();
      availableModels = data.models;
      defaultModel = data.defaultmodel;

      const modelSelect = document.getElementById('aiModelSelect');
      if (modelSelect) {
        // Clear existing options
        modelSelect.innerHTML = '';

        // Populate with models
        availableModels.forEach(model => {
          const option = document.createElement('option');
          option.value = model;
          option.textContent = model;
          modelSelect.appendChild(option);
        });

        // Set default selected model
        if (defaultModel) {
          modelSelect.value = defaultModel;
        }
      }
    } else {
      console.error('Failed to fetch AI models.');
    }
  } catch (e) {
    console.error('Error fetching AI models:', e);
  }
}

// Function to update the chat history viewer with new chat_histories
function updateChatHistoryViewer(chatHistories) {
  const chatBox = document.getElementById('chatBox');
  const commitSummaries = document.getElementById('commitSummaries');
  const activeCodingContexts = document.getElementById('activeCodingContexts');

  // Clear existing content
  chatBox.innerHTML = '';
  commitSummaries.innerHTML = '';
  activeCodingContexts.innerHTML = '';

  // Iterate over chatHistories and append messages and summaries
  chatHistories.forEach(msg => {
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

  // Optionally, scroll to bottom
  scrollToBottom(chatBox);
  scrollToBottom(commitSummaries);
}

// Function to show the "new project" placeholder page
function showPlaceholderPage() {
  const sourceCodeContainer = document.getElementById('sourceCodeContainer');
  const chatBox = document.getElementById('chatBox');
  const commitSummaries = document.getElementById('commitSummaries');
  const activeCodingContexts = document.getElementById('activeCodingContexts');

  if (sourceCodeContainer) sourceCodeContainer.classList.add('hidden');
  if (document.getElementById('chatContainer')) document.getElementById('chatContainer').classList.add('hidden');
  if (commitSummaries) commitSummaries.classList.add('hidden');
  if (activeCodingContexts) activeCodingContexts.classList.add('hidden');

  let placeholder = document.getElementById('newProjectPlaceholder');
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.id = 'newProjectPlaceholder';
    placeholder.innerHTML = `
      <h2>Welcome to Your New Project</h2>
      <p>Please create or open files using the project browser pane on the left.</p>
      <p>Getting started:</p>
      <ul>
        <li>Click the "New File" button to create a new file.</li>
        <li>Select an existing file from the project browser to open it.</li>
      </ul>
    `;
    // Remove inline styles, add 'hidden' class to hide initially
    placeholder.classList.add('hidden');
    // Insert before sourceCodeContainer
    sourceCodeContainer.parentNode.insertBefore(placeholder, sourceCodeContainer);
  }
  // Show placeholder
  placeholder.classList.remove('hidden');
}

// Function to hide the "new project" placeholder page
function hidePlaceholderPage() {
  const sourceCodeContainer = document.getElementById('sourceCodeContainer');
  const chatBox = document.getElementById('chatBox');
  const commitSummaries = document.getElementById('commitSummaries');
  const activeCodingContexts = document.getElementById('activeCodingContexts');

  if (sourceCodeContainer) sourceCodeContainer.classList.remove('hidden');
  if (document.getElementById('chatContainer')) document.getElementById('chatContainer').classList.remove('hidden');
  if (chatBox) chatBox.classList.remove('hidden');
  if (commitSummaries) commitSummaries.classList.remove('hidden');
  if (activeCodingContexts) activeCodingContexts.classList.remove('hidden');

  const placeholder = document.getElementById('newProjectPlaceholder');
  if (placeholder) {
    placeholder.classList.add('hidden');
  }
}

// Function to load and display the current Git branch
async function loadGitBranch() {
  try {
    const response = await fetch('/git_current_branch?project_name=' + currentProject);
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

// Continue with the rest of your existing functions as they are...
// (Functions like createNewFile, extract_commit_summary, etc., remain unchanged)