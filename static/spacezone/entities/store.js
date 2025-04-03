room.registerElement('spacezone-store', {
  storeData: {},
  currentCategory: '',
  budget: null,
  selectedItem: null,

  create() {
    let root = this.root = document.createElement('div');
    root.className = 'spacezone-store';
    
    fetch('assets/store-items.json')
      .then(response => response.json())
      .then(data => {
        this.storeData = data;
        this.showItems(this.budget);
      })
      .catch(err => console.error('Failed to load store items:', err));
  },

  showItems(budget) {
    this.root.innerHTML = ''; // Clear existing content
	this.budget = budget;

    // Create Tabs
    const tabs = document.createElement('div');
    tabs.className = 'store-tabs';
    Object.keys(this.storeData).forEach((category, index) => {
      const tab = document.createElement('div');
      tab.className = 'store-tab';
      tab.textContent = category;
      if (index === 0) {
        tab.classList.add('active');
        this.currentCategory = category;
      }
      tab.addEventListener('click', () => this.switchCategory(category, tab, this.root, budget));
      tabs.appendChild(tab);
    });
    this.root.appendChild(tabs);

    // Create Content Area
    const content = document.createElement('div');
    content.className = 'store-content';
    
    // Create Item Grid
    const grid = document.createElement('div');
    grid.className = 'item-grid';
    this.storeData[this.currentCategory].forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'store-item';
      
      if (item.price > budget.currentbalance) {
        itemDiv.classList.add('over-budget');
      }

      // Create Image Element
      const img = document.createElement('img');
      img.src = item.image ? item.image : 'assets/store/noimage.png';
      img.alt = item.name;
      img.className = 'store-item-image';
      itemDiv.appendChild(img);

      // Create Name Element
      const nameDiv = document.createElement('div');
      nameDiv.className = 'store-item-name';
      nameDiv.textContent = item.name;
      itemDiv.appendChild(nameDiv);

      // Create Price Element
      const priceDiv = document.createElement('div');
      priceDiv.className = 'store-item-price';
      const formattedPrice = new Intl.NumberFormat().format(item.price);
      priceDiv.textContent = `${formattedPrice}₿`;
      itemDiv.appendChild(priceDiv);

      itemDiv.addEventListener('click', () => this.selectItem(itemDiv, item, this.root, budget));
      grid.appendChild(itemDiv);
    });
    content.appendChild(grid);

    // Create Item Details Area
    this.details = document.createElement('div');
    this.details.className = 'item-details';
    content.appendChild(this.details);

    this.root.appendChild(content);
    return this.root;
  },

  switchCategory(category, tabElement, root, budget) {
    // Update active tab
    const activeTab = root.querySelector('.store-tab.active');
    if (activeTab) activeTab.classList.remove('active');
    tabElement.classList.add('active');

    this.currentCategory = category;
    this.selectedItem = null;
    this.details.innerHTML = '';

    const grid = root.querySelector('.item-grid');
    grid.innerHTML = '';
    this.storeData[category].forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'store-item';
      
      if (item.price > budget.currentbalance) {
        itemDiv.classList.add('over-budget');
      }

      // Create Image Element
      const img = document.createElement('img');
      img.src = item.image ? item.image : 'assets/store/noimage.png';
      img.alt = item.name;
      img.className = 'store-item-image';
      itemDiv.appendChild(img);

      // Create Name Element
      const nameDiv = document.createElement('div');
      nameDiv.className = 'store-item-name';
      nameDiv.textContent = item.name;
      itemDiv.appendChild(nameDiv);

      // Create Price Element
      const priceDiv = document.createElement('div');
      priceDiv.className = 'store-item-price';
      const formattedPrice = new Intl.NumberFormat().format(item.price);
      priceDiv.textContent = `${formattedPrice}₿`;
      itemDiv.appendChild(priceDiv);

      itemDiv.addEventListener('click', () => this.selectItem(itemDiv, item, this.root, budget));
      grid.appendChild(itemDiv);
    });
  },

  selectItem(itemElement, itemData, root, budget) {
    // Deselect previous
    const previousSelected = root.querySelector('.store-item.selected');
    if (previousSelected) previousSelected.classList.remove('selected');
    // Select new
    itemElement.classList.add('selected');
    this.selectedItem = itemData;

    // Update details
    this.details.innerHTML = '';

    // Create Image Element
    const detailImg = document.createElement('img');
    detailImg.src = itemData.image ? itemData.image : 'assets/store/noimage.png';
    detailImg.alt = itemData.name;
    detailImg.className = 'details-item-image';
    this.details.appendChild(detailImg);

    const name = document.createElement('div');
    name.className = 'details-item-name';
    name.textContent = `Name: ${itemData.name}`;
    this.details.appendChild(name);

    if (itemData.description) {
      const description = document.createElement('div');
      description.className = 'details-item-description';
      description.textContent = `Description: ${itemData.description}`;
      this.details.appendChild(description);
    }

    const price = document.createElement('div');
    price.className = 'details-item-price';
    const formattedPrice = new Intl.NumberFormat().format(itemData.price);
    price.textContent = `Price: ${formattedPrice}₿`;
    this.details.appendChild(price);

    const buyButton = document.createElement('button');
    buyButton.className = 'buy-button';
    buyButton.textContent = 'Buy';
    
    if (itemData.price > budget.currentbalance) {
      buyButton.classList.add('disabled');
      buyButton.disabled = true;
    } else {
      buyButton.addEventListener('click', () => this.purchaseItem(root));
    }

    this.details.appendChild(buyButton);
  },

  purchaseItem(root) {
    if (this.selectedItem) {
      // Dispatch purchase event
      this.dispatchEvent({ type: 'purchased', data: this.selectedItem });
      
      this.details.innerHTML = '<div>Purchase successful!</div>';
      this.selectedItem = null;
      
      const selectedElement = root.querySelector('.store-item.selected');
      if (selectedElement) selectedElement.classList.remove('selected');
    }
  }
});