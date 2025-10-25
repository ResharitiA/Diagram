class NetworkDiagram {
    constructor() {
        this.placedObjects = [];
        this.connections = [];
        this.selectedObject = null;
        this.selectedCableType = null;
        this.isDragging = false;
        this.isConnecting = false;
        this.connectionStart = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.originalX = 0;
        this.originalY = 0;
        
        // Выделение области
        this.isSelecting = false;
        this.selectionStart = { x: 0, y: 0 };
        this.selectionEnd = { x: 0, y: 0 };
        this.selectionRect = null;
        this.multiSelectedObjects = [];
        
        // Масштабирование
        this.scale = 1;
        this.minScale = 0.3;
        this.maxScale = 3;
        this.scaleStep = 0.1;
        
        // История для Ctrl+Z/Ctrl+Y
        this.history = [];
        this.historyIndex = -1;
        this.maxHistorySize = 50;
        
        // Добавляем состояние для перемещения рабочей области
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
    this.panX = 0;
    this.panY = 0;
    this.originalPanX = 0;
    this.originalPanY = 0;
        
        this.init();
    }

    init() {
        console.log('Инициализация приложения...');
        this.setupEventListeners();
        this.setupContextMenu();
        this.setupConnectionsLayer();
        this.setupZoomControls();
        this.updatePlacedObjectsList();
        this.updateConnectionsList();
        this.updateZoomDisplay();
        this.saveState();
    }

    setupEventListeners() {
        // Перетаскивание объектов из панели
        document.querySelectorAll('.object-item').forEach(item => {
            item.addEventListener('dragstart', this.handleDragStart.bind(this));
        });

        // Выбор типа кабеля
        document.querySelectorAll('.cable-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.selectCableType(e.currentTarget.dataset.type);
            });
        });

        // Рабочее поле
        const workspace = document.querySelector('.workspace');
        workspace.addEventListener('dragover', this.handleDragOver.bind(this));
        workspace.addEventListener('drop', this.handleDrop.bind(this));
        workspace.addEventListener('mousedown', this.handleWorkspaceMouseDown.bind(this));
        workspace.addEventListener('contextmenu', this.handleWorkspaceContextMenu.bind(this));
        
        // Глобальные события
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

        // Обработчики для кнопок управления
        document.getElementById('exportBtn').addEventListener('click', () => this.exportToJSON());
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });
        document.getElementById('importFile').addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.importFromJSON(e.target.files[0]);
            }
        });
        document.getElementById('clearBtn').addEventListener('click', () => this.clearWorkspace());
        document.getElementById('undoBtn').addEventListener('click', () => this.undo());
        document.getElementById('redoBtn').addEventListener('click', () => this.redo());

        console.log('Слушатели событий установлены');
    }

    handleWorkspaceMouseDown(e) {
        // Левая кнопка мыши - начало выделения области
        if (e.button === 0 && !this.isConnecting && !this.isDragging) {
            e.preventDefault();
            e.stopPropagation();
            this.startSelection(e);
        }

        // Средняя кнопка или колесо — начало панорамирования (drag to pan)
        if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
            this.isPanning = true;
            this.panStartX = e.clientX;
            this.panStartY = e.clientY;
            this.originalPanX = this.panX;
            this.originalPanY = this.panY;
            document.body.style.cursor = 'grabbing';
        }
    }

    handleWorkspaceContextMenu(e) {
        // Правая кнопка мыши - показ меню для удаления выделенных объектов
        if (this.multiSelectedObjects.length > 0) {
            e.preventDefault();
            e.stopPropagation();
            this.showMultiSelectionContextMenu(e);
        }
    }

    startSelection(e) {
        const workspace = document.querySelector('.workspace');
        const rect = workspace.getBoundingClientRect();
        
        this.isSelecting = true;
        this.selectionStart = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        this.selectionEnd = { ...this.selectionStart };
        
        // Создаем элемент для отображения области выделения
        this.selectionRect = document.createElement('div');
        this.selectionRect.className = 'selection-rect';
        workspace.appendChild(this.selectionRect);
        
        this.updateSelectionRect();
        console.log('Начало выделения области:', this.selectionStart);
    }

    updateSelectionRect() {
        if (!this.selectionRect) return;
        
        const left = Math.min(this.selectionStart.x, this.selectionEnd.x);
        const top = Math.min(this.selectionStart.y, this.selectionEnd.y);
        const width = Math.abs(this.selectionEnd.x - this.selectionStart.x);
        const height = Math.abs(this.selectionEnd.y - this.selectionStart.y);
        
        this.selectionRect.style.left = left + 'px';
        this.selectionRect.style.top = top + 'px';
        this.selectionRect.style.width = width + 'px';
        this.selectionRect.style.height = height + 'px';
        
        // Обновляем выделение объектов
        this.updateMultiSelection(left, top, width, height);
    }

    updateMultiSelection(rectLeft, rectTop, rectWidth, rectHeight) {
        // Снимаем выделение со всех объектов
        this.multiSelectedObjects.forEach(obj => {
            obj.element.classList.remove('multi-selected');
        });
        this.multiSelectedObjects = [];
        
        const workspaceInner = document.getElementById('workspaceInner');
        const workspaceRect = workspaceInner.getBoundingClientRect();
        const scale = this.scale;
        
        // Преобразуем координаты области выделения в координаты рабочей области
        const selectionLeft = (rectLeft - workspaceRect.left) / scale;
        const selectionTop = (rectTop - workspaceRect.top) / scale;
        const selectionWidth = rectWidth / scale;
        const selectionHeight = rectHeight / scale;
        
        // Выделяем объекты, попадающие в область
        this.placedObjects.forEach(obj => {
            const objLeft = obj.x;
            const objTop = obj.y;
            const objRight = obj.x + 80;
            const objBottom = obj.y + 80;
            
            // Проверяем пересечение объекта с областью выделения
            if (objLeft < selectionLeft + selectionWidth &&
                objRight > selectionLeft &&
                objTop < selectionTop + selectionHeight &&
                objBottom > selectionTop) {
                
                obj.element.classList.add('multi-selected');
                this.multiSelectedObjects.push(obj);
            }
        });
        
        console.log('Выделено объектов:', this.multiSelectedObjects.length);
    }

    finishSelection() {
        if (this.isSelecting && this.selectionRect) {
            this.selectionRect.remove();
            this.selectionRect = null;
            this.isSelecting = false;
            
            console.log('Завершено выделение. Объектов выделено:', this.multiSelectedObjects.length);
        }
    }

    showMultiSelectionContextMenu(e) {
        this.hideContextMenu();

        const contextMenu = document.createElement('div');
        contextMenu.id = 'contextMenu';
        contextMenu.style.position = 'fixed';
        contextMenu.style.background = 'white';
        contextMenu.style.border = '1px solid #ddd';
        contextMenu.style.borderRadius = '6px';
        contextMenu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        contextMenu.style.zIndex = '10000';
        contextMenu.style.minWidth = '200px';
        contextMenu.style.padding = '4px 0';
        
        contextMenu.innerHTML = `
            <div class="context-menu-item" id="contextDeleteMultiple" style="padding: 10px 16px; cursor: pointer; font-size: 14px; transition: background-color 0.2s; border-bottom: 1px solid #f0f0f0;">
                🗑️ Удалить выделенные объекты (${this.multiSelectedObjects.length})
            </div>
            <div class="context-menu-item" id="contextClearSelection" style="padding: 10px 16px; cursor: pointer; font-size: 14px; transition: background-color 0.2s;">
                ❌ Снять выделение
            </div>
        `;

        contextMenu.style.left = e.clientX + 'px';
        contextMenu.style.top = e.clientY + 'px';

        document.body.appendChild(contextMenu);

        // Добавляем обработчики для пунктов меню
        setTimeout(() => {
            document.getElementById('contextDeleteMultiple').addEventListener('click', () => {
                this.deleteMultipleObjects();
            });
            document.getElementById('contextDeleteMultiple').addEventListener('mouseenter', function() {
                this.style.background = '#007bff';
                this.style.color = 'white';
            });
            document.getElementById('contextDeleteMultiple').addEventListener('mouseleave', function() {
                this.style.background = '';
                this.style.color = '';
            });
            
            document.getElementById('contextClearSelection').addEventListener('click', () => {
                this.clearMultiSelection();
            });
            document.getElementById('contextClearSelection').addEventListener('mouseenter', function() {
                this.style.background = '#007bff';
                this.style.color = 'white';
            });
            document.getElementById('contextClearSelection').addEventListener('mouseleave', function() {
                this.style.background = '';
                this.style.color = '';
            });
        }, 0);
    }

    deleteMultipleObjects() {
        if (this.multiSelectedObjects.length === 0) return;
        
        if (confirm(`Удалить ${this.multiSelectedObjects.length} выделенных объектов?`)) {
            // Удаляем соединения, связанные с выделенными объектами
            const objectIds = this.multiSelectedObjects.map(obj => obj.id);
            this.connections = this.connections.filter(conn => 
                !objectIds.includes(conn.from) && !objectIds.includes(conn.to)
            );
            
            // Удаляем объекты
            this.multiSelectedObjects.forEach(obj => {
                const index = this.placedObjects.findIndex(placedObj => placedObj.id === obj.id);
                if (index !== -1) {
                    this.placedObjects.splice(index, 1);
                    obj.element.remove();
                }
            });
            
            this.multiSelectedObjects = [];
            this.selectedObject = null;
            this.updatePlacedObjectsList();
            this.updateConnectionsList();
            this.renderConnections();
            this.saveState();
            this.hideContextMenu();
            
            console.log(`Удалено объектов: ${this.multiSelectedObjects.length}`);
        }
    }

    clearMultiSelection() {
        this.multiSelectedObjects.forEach(obj => {
            obj.element.classList.remove('multi-selected');
        });
        this.multiSelectedObjects = [];
        this.hideContextMenu();
    }

    setupZoomControls() {
        document.getElementById('zoomIn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOut').addEventListener('click', () => this.zoomOut());
        document.getElementById('zoomReset').addEventListener('click', () => this.zoomReset());
    }

    zoomIn() {
        // Zoom around center of viewport
        const workspace = document.getElementById('workspaceInner');
        const rect = workspace.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        this._zoomAnchor = { clientX: centerX, clientY: centerY };
        this.setScale(this.scale + this.scaleStep);
    }

    zoomOut() {
        const workspace = document.getElementById('workspaceInner');
        const rect = workspace.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        this._zoomAnchor = { clientX: centerX, clientY: centerY };
        this.setScale(this.scale - this.scaleStep);
    }

    zoomReset() {
        const workspace = document.getElementById('workspaceInner');
        const rect = workspace.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        this._zoomAnchor = { clientX: centerX, clientY: centerY };
        this.setScale(1);
    }

    setScale(newScale) {
        newScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
        if (newScale === this.scale) return;

        // Изменяем масштаб, сохраняя текущую точку (по умолчанию левый верхний угол)
        // если вызвано с координатами курсора, используем их для центрирования зума
        const workspace = document.getElementById('workspaceInner');
        // Получаем текущие трансформации из сохраняемых значений (panX/panY)
        let currentX = this.panX;
        let currentY = this.panY;

        // Если есть явные координаты точки масштабирования, она будет передана через временные свойства
        // В нашем коде setScale может быть вызван с this._zoomAnchor {clientX, clientY}
        if (this._zoomAnchor) {
            const rect = workspace.getBoundingClientRect();
            const clientX = this._zoomAnchor.clientX;
            const clientY = this._zoomAnchor.clientY;

            // Позиция курсора относительно видимой части элемента (после текущего трансформа)
            const mouseX = clientX - rect.left; // эквивалентно clientX - panX
            const mouseY = clientY - rect.top;

            // Точка в координатах содержимого до масштабирования
            const worldX = mouseX / this.scale;
            const worldY = mouseY / this.scale;

            // Новые pan, чтобы та же world-точка осталась под тем же экранным клиентX/clientY
            const newPanX = clientX - worldX * newScale;
            const newPanY = clientY - worldY * newScale;

            this.panX = newPanX;
            this.panY = newPanY;

            // Очистим якорь после использования
            this._zoomAnchor = null;
        } else {
            // Без якоря — сохраняем текущее смещение (панорамирование не меняется)
            this.panX = currentX;
            this.panY = currentY;
        }

    // Use scale first, then translate so panX/panY represent screen pixels
    workspace.style.transform = `scale(${newScale}) translate(${this.panX}px, ${this.panY}px)`;
        this.scale = newScale;
        this.updateZoomDisplay();
        this.applyScale();
    }

    applyScale() {
        // Этот метод больше не нужен, так как масштабирование происходит через transform
        // Оставляем только обновление сетки
        const grid = document.getElementById('grid');
        const gridSize = 20 * this.scale;
        grid.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    }

    updateZoomDisplay() {
        const zoomLevel = document.getElementById('zoomLevel');
        zoomLevel.textContent = Math.round(this.scale * 100) + '%';
    }

    handleWheel(e) {
        if (e.ctrlKey) {
            e.preventDefault();
            // Устанавливаем якорь зума — координаты курсора — и вызываем setScale
            // (setScale сам посчитает новые panX/panY)
            this._zoomAnchor = { clientX: e.clientX, clientY: e.clientY };
            const delta = e.deltaY > 0 ? -this.scaleStep : this.scaleStep;
            const newScale = Math.max(this.minScale, Math.min(this.maxScale, this.scale + delta));
            this.setScale(newScale);
        }
    }

    setupConnectionsLayer() {
        const connectionsLayer = document.getElementById('connectionsLayer');
        
        // Добавляем маркер для стрелок
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '7');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '3.5');
        marker.setAttribute('orient', 'auto');
        
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
        polygon.setAttribute('fill', '#666');
        
        marker.appendChild(polygon);
        defs.appendChild(marker);
        connectionsLayer.appendChild(defs);
    }

    selectCableType(cableType) {
        document.querySelectorAll('.cable-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const selectedCable = document.querySelector(`.cable-item[data-type="${cableType}"]`);
        if (selectedCable) {
            selectedCable.classList.add('selected');
        }
        
        this.selectedCableType = cableType;
        document.getElementById('currentCableType').textContent = this.getCableLabel(cableType);
        
        console.log('Выбран тип кабеля:', cableType);
    }

    getCableLabel(cableType) {
        const labels = {
            ethernet: 'Ethernet',
            fiber: 'Оптоволокно',
            coaxial: 'Коаксиальный',
            serial: 'Последовательный'
        };
        return labels[cableType] || cableType;
    }

    setupContextMenu() {
        document.addEventListener('contextmenu', (e) => {
            const placedObject = e.target.closest('.placed-object');
            if (placedObject) {
                e.preventDefault();
                this.showContextMenu(e, placedObject);
            }
        });

        document.addEventListener('click', () => {
            this.hideContextMenu();
        });
    }

    showContextMenu(e, objectElement) {
        this.hideContextMenu();

        const objectId = objectElement.id;
        const object = this.placedObjects.find(obj => obj.id === objectId);
        
        if (!object) return;

        this.selectedObject = object;

        const contextMenu = document.createElement('div');
        contextMenu.id = 'contextMenu';
        contextMenu.style.position = 'fixed';
        contextMenu.style.background = 'white';
        contextMenu.style.border = '1px solid #ddd';
        contextMenu.style.borderRadius = '6px';
        contextMenu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        contextMenu.style.zIndex = '10000';
        contextMenu.style.minWidth = '160px';
        contextMenu.style.padding = '4px 0';
        
        contextMenu.innerHTML = `
            <div class="context-menu-item" id="contextDelete" style="padding: 8px 16px; cursor: pointer; font-size: 14px; transition: background-color 0.2s;">
                🗑️ Удалить объект
            </div>
            <div class="context-menu-item" id="contextConnect" style="padding: 8px 16px; cursor: pointer; font-size: 14px; transition: background-color 0.2s;">
                🔗 Создать соединение
            </div>
        `;

        contextMenu.style.left = e.clientX + 'px';
        contextMenu.style.top = e.clientY + 'px';

        document.body.appendChild(contextMenu);

        setTimeout(() => {
            document.getElementById('contextDelete').addEventListener('click', () => {
                this.deleteSelectedObject();
            });
            document.getElementById('contextDelete').addEventListener('mouseenter', function() {
                this.style.background = '#007bff';
                this.style.color = 'white';
            });
            document.getElementById('contextDelete').addEventListener('mouseleave', function() {
                this.style.background = '';
                this.style.color = '';
            });
            
            document.getElementById('contextConnect').addEventListener('click', () => {
                this.startConnectionFromMenu();
            });
            document.getElementById('contextConnect').addEventListener('mouseenter', function() {
                this.style.background = '#007bff';
                this.style.color = 'white';
            });
            document.getElementById('contextConnect').addEventListener('mouseleave', function() {
                this.style.background = '';
                this.style.color = '';
            });
        }, 0);
    }

    startConnectionFromMenu() {
        if (this.selectedObject && this.selectedCableType) {
            this.isConnecting = true;
            this.connectionStart = this.selectedObject;
            this.hideContextMenu();
            console.log('Начало соединения от объекта:', this.selectedObject.id);
        } else if (!this.selectedCableType) {
            alert('Сначала выберите тип кабеля в левой панели!');
        }
    }

    hideContextMenu() {
        const contextMenu = document.getElementById('contextMenu');
        if (contextMenu) {
            contextMenu.remove();
        }
    }

    deleteSelectedObject() {
        if (this.selectedObject) {
            this.connections = this.connections.filter(conn => 
                conn.from !== this.selectedObject.id && conn.to !== this.selectedObject.id
            );
            this.deleteObject(this.selectedObject);
            this.hideContextMenu();
            this.updateConnectionsList();
            this.renderConnections();
        }
    }

    handleDragStart(e) {
        const type = e.target.closest('.object-item').dataset.type;
        e.dataTransfer.setData('text/plain', type);
        console.log('Начато перетаскивание:', type);
    }

    handleDragOver(e) {
        e.preventDefault();
    }

    handleDrop(e) {
        e.preventDefault();
        const type = e.dataTransfer.getData('text/plain');
        const workspaceInner = document.getElementById('workspaceInner');
        const rect = workspaceInner.getBoundingClientRect();
        
        const scale = this.scale;
        const x = (e.clientX - rect.left) / scale - 40;
        const y = (e.clientY - rect.top) / scale - 40;
        
        console.log('Объект размещен:', type, 'в позиции', x, y, 'масштаб:', scale);
        this.createObject(type, x, y);
        this.saveState();
    }

    createObject(type, x, y) {
        const id = 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        const object = {
            id,
            type,
            x,
            y,
            element: null,
            connectionPoint: null
        };

        this.placedObjects.push(object);
        this.renderObject(object);
        this.updatePlacedObjectsList();
        
        console.log('Создан объект:', object);
    }

    renderObject(object) {
        const container = document.getElementById('objectsContainer');
        
        const element = document.createElement('div');
        element.className = 'placed-object';
        element.id = object.id;
        element.style.left = object.x + 'px';
        element.style.top = object.y + 'px';
        
        const icons = {
            router: '🔄',
            switch: '🔀',
            server: '🖥️',
            pc: '💻',
            firewall: '🔥'
        };
        
        const labels = {
            router: 'Маршрутизатор',
            switch: 'Коммутатор',
            server: 'Сервер',
            pc: 'Компьютер',
            firewall: 'Фаервол'
        };

        element.innerHTML = `
            <div class="icon">${icons[object.type]}</div>
            <div class="label">${labels[object.type]}</div>
        `;

        const connectionPoint = document.createElement('div');
        connectionPoint.className = 'connection-point';
        connectionPoint.style.left = '34px';
        connectionPoint.style.top = '34px';
        connectionPoint.addEventListener('mousedown', (e) => this.startConnection(e, object));
        element.appendChild(connectionPoint);
        object.connectionPoint = connectionPoint;

        element.addEventListener('mousedown', (e) => this.startDragging(e, object));
        element.addEventListener('click', (e) => {
            if (this.isConnecting && this.connectionStart && this.connectionStart.id !== object.id) {
                this.finishConnection(object);
                return;
            }
            e.stopPropagation();
            this.selectObject(object);
        });
        
        container.appendChild(element);
        object.element = element;
        
        console.log('Объект отрисован:', object.id);
    }

    startConnection(e, object) {
        if (!this.selectedCableType) {
            alert('Сначала выберите тип кабеля в левой панели!');
            return;
        }
        
        e.stopPropagation();
        this.isConnecting = true;
        this.connectionStart = object;
        console.log('Начало соединения от объекта:', object.id);
    }

    finishConnection(targetObject) {
        if (!this.connectionStart || !this.selectedCableType) return;

        const connection = {
            id: 'conn_' + Date.now(),
            from: this.connectionStart.id,
            to: targetObject.id,
            type: this.selectedCableType
        };

        const existingConnection = this.connections.find(conn => 
            (conn.from === connection.from && conn.to === connection.to) ||
            (conn.from === connection.to && conn.to === connection.from)
        );

        if (!existingConnection) {
            this.connections.push(connection);
            this.renderConnection(connection);
            this.updateConnectionsList();
            this.saveState();
            console.log('Создано соединение:', connection);
        } else {
            console.log('Соединение уже существует');
        }

        this.isConnecting = false;
        this.connectionStart = null;
    }

    renderConnection(connection) {
        const connectionsLayer = document.getElementById('connectionsLayer');
        
        const fromObject = this.placedObjects.find(obj => obj.id === connection.from);
        const toObject = this.placedObjects.find(obj => obj.id === connection.to);
        
        if (!fromObject || !toObject) return;

        const fromX = fromObject.x + 40;
        const fromY = fromObject.y + 40;
        const toX = toObject.x + 40;
        const toY = toObject.y + 40;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        const dx = toX - fromX;
        const dy = toY - fromY;
        const controlX1 = fromX + dx * 0.5;
        const controlY1 = fromY;
        const controlX2 = fromX + dx * 0.5;
        const controlY2 = toY;
        
        const pathData = `M ${fromX} ${fromY} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${toX} ${toY}`;
        
        line.setAttribute('d', pathData);
        line.setAttribute('class', `connection ${connection.type}`);
        line.setAttribute('data-connection-id', connection.id);
        line.setAttribute('marker-end', 'url(#arrowhead)');
        
        connectionsLayer.appendChild(line);
        connection.element = line;
    }

    renderConnections() {
        const connectionsLayer = document.getElementById('connectionsLayer');
        // Сохраняем defs
        const defs = connectionsLayer.querySelector('defs');
        // Удаляем только соединения
        const connections = connectionsLayer.querySelectorAll('.connection');
        connections.forEach(conn => conn.remove());
        
        // Восстанавливаем defs если они были удалены
        if (!connectionsLayer.querySelector('defs') && defs) {
            connectionsLayer.appendChild(defs);
        }
        
        this.connections.forEach(connection => {
            this.renderConnection(connection);
        });
    }

    updateConnectionsList() {
        const list = document.getElementById('connectionsList');
        list.innerHTML = '';
        
        this.connections.forEach(conn => {
            const fromObject = this.placedObjects.find(obj => obj.id === conn.from);
            const toObject = this.placedObjects.find(obj => obj.id === conn.to);
            
            if (fromObject && toObject) {
                const item = document.createElement('div');
                item.className = 'connection-item';
                item.innerHTML = `
                    <div class="cable-icon ${conn.type}">${this.getCableIcon(conn.type)}</div>
                    <span>${this.getCableLabel(conn.type)}: ${fromObject.type} → ${toObject.type}</span>
                `;
                list.appendChild(item);
            }
        });
    }

    getCableIcon(cableType) {
        const icons = {
            ethernet: '🔗',
            fiber: '🔆',
            coaxial: '⛓️',
            serial: '🔌'
        };
        return icons[cableType] || '🔗';
    }

    startDragging(e, object) {
        if (this.isConnecting) return;
        
        console.log('Начало перемещения объекта:', object.id);
        
        this.isDragging = true;
        this.selectedObject = object;
        
        const workspaceInner = document.getElementById('workspaceInner');
        const rect = workspaceInner.getBoundingClientRect();
        const scale = this.scale;
        
        this.dragStartX = (e.clientX - rect.left) / scale - object.x;
        this.dragStartY = (e.clientY - rect.top) / scale - object.y;
        this.originalX = object.x;
        this.originalY = object.y;
        
        object.element.style.cursor = 'grabbing';
        object.element.style.zIndex = '1000';
        object.element.classList.add('selected');
        
        e.preventDefault();
        e.stopPropagation();
    }

    handleMouseMove(e) {
        if (this.isPanning) {
            const deltaX = e.clientX - this.panStartX;
            const deltaY = e.clientY - this.panStartY;
            
            const workspace = document.getElementById('workspaceInner');
            const newPanX = this.originalPanX + deltaX;
            const newPanY = this.originalPanY + deltaY;
            this.panX = newPanX;
            this.panY = newPanY;
            // Apply scale first so translate values are in screen pixels (not scaled)
            workspace.style.transform = `scale(${this.scale}) translate(${newPanX}px, ${newPanY}px)`;
            return;
        }
        
        if (this.isSelecting) {
            const workspace = document.querySelector('.workspace');
            const rect = workspace.getBoundingClientRect();
            
            this.selectionEnd = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            
            this.updateSelectionRect();
            return;
        }

        if (this.isConnecting && this.connectionStart) {
            this.renderTemporaryConnection(e);
            return;
        }

        if (!this.isDragging || !this.selectedObject) {
            return;
        }

        const workspaceInner = document.getElementById('workspaceInner');
        const rect = workspaceInner.getBoundingClientRect();
        const scale = this.scale;
        
        let newX = (e.clientX - rect.left) / scale - this.dragStartX;
        let newY = (e.clientY - rect.top) / scale - this.dragStartY;

        const gridSize = 20;
        newX = Math.round(newX / gridSize) * gridSize;
        newY = Math.round(newY / gridSize) * gridSize;

        const container = document.getElementById('objectsContainer');
        const containerRect = container.getBoundingClientRect();
        newX = Math.max(0, Math.min(newX, containerRect.width / scale - 80));
        newY = Math.max(0, Math.min(newY, containerRect.height / scale - 80));

        this.selectedObject.x = newX;
        this.selectedObject.y = newY;
        
        this.selectedObject.element.style.left = newX + 'px';
        this.selectedObject.element.style.top = newY + 'px';

        this.renderConnections();
    }

    renderTemporaryConnection(e) {
        const tempLine = document.getElementById('tempConnection');
        if (tempLine) tempLine.remove();

        const fromObject = this.connectionStart;
        const workspaceInner = document.getElementById('workspaceInner');
        const rect = workspaceInner.getBoundingClientRect();
        const scale = this.scale;
        
        const fromX = fromObject.x + 40;
        const fromY = fromObject.y + 40;
        
        const toX = (e.clientX - rect.left) / scale;
        const toY = (e.clientY - rect.top) / scale;

        const connectionsLayer = document.getElementById('connectionsLayer');
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        
        line.setAttribute('id', 'tempConnection');
        line.setAttribute('x1', fromX);
        line.setAttribute('y1', fromY);
        line.setAttribute('x2', toX);
        line.setAttribute('y2', toY);
        line.setAttribute('class', `connection ${this.selectedCableType} highlight`);
        line.setAttribute('stroke-dasharray', '5,5');
        line.setAttribute('marker-end', 'url(#arrowhead)');
        
        connectionsLayer.appendChild(line);
    }

    handleMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            document.body.style.cursor = '';
        }
        
        if (this.isSelecting) {
            this.finishSelection();
        }

        if (this.isConnecting && this.connectionStart) {
            const tempLine = document.getElementById('tempConnection');
            if (tempLine) tempLine.remove();
        }

        if (this.isDragging && this.selectedObject) {
            console.log('Завершено перемещение объекта:', this.selectedObject.id);
            
            this.isDragging = false;
            this.selectedObject.element.style.cursor = 'move';
            this.selectedObject.element.style.zIndex = '';
            
            this.updatePlacedObjectsList();
            this.saveState();
        }
    }

    selectObject(object) {
        if (this.isDragging || this.isConnecting) return;
        
        // Снимаем множественное выделение при одиночном выборе
        if (this.multiSelectedObjects.length > 0) {
            this.clearMultiSelection();
        }
        
        console.log('Выбран объект:', object.id);
        
        document.querySelectorAll('.placed-object').forEach(el => {
            el.classList.remove('selected');
        });
        
        object.element.classList.add('selected');
        this.selectedObject = object;
    }

    handleKeyDown(e) {
        // Ctrl+Z - отмена
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            this.undo();
            return;
        }
        
        // Ctrl+Y - повтор
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            this.redo();
            return;
        }

        // Масштабирование Ctrl + +/-
        if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
            e.preventDefault();
            this.zoomIn();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === '-') {
            e.preventDefault();
            this.zoomOut();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === '0') {
            e.preventDefault();
            this.zoomReset();
            return;
        }

        // Delete - удаление выделенного объекта или группы
        if (e.key === 'Delete') {
            if (this.multiSelectedObjects.length > 0) {
                this.deleteMultipleObjects();
            } else if (this.selectedObject) {
                console.log('Удаление объекта:', this.selectedObject.id);
                this.connections = this.connections.filter(conn => 
                    conn.from !== this.selectedObject.id && conn.to !== this.selectedObject.id
                );
                this.deleteObject(this.selectedObject);
                this.updateConnectionsList();
                this.renderConnections();
                this.saveState();
            }
            return;
        }
        
        // Стрелки - перемещение выделенного объекта
        if (this.selectedObject && !this.isDragging) {
            const step = 20;
            let newX = this.selectedObject.x;
            let newY = this.selectedObject.y;
            
            switch(e.key) {
                case 'ArrowLeft':
                    newX -= step;
                    break;
                case 'ArrowRight':
                    newX += step;
                    break;
                case 'ArrowUp':
                    newY -= step;
                    break;
                case 'ArrowDown':
                    newY += step;
                    break;
            }
            
            const container = document.getElementById('objectsContainer');
            const rect = container.getBoundingClientRect();
            const scale = this.scale;
            
            newX = Math.max(0, Math.min(newX, rect.width / scale - 80));
            newY = Math.max(0, Math.min(newY, rect.height / scale - 80));
            
            this.selectedObject.x = newX;
            this.selectedObject.y = newY;
            this.selectedObject.element.style.left = newX + 'px';
            this.selectedObject.element.style.top = newY + 'px';
            
            this.updatePlacedObjectsList();
            this.renderConnections();
            this.saveState();
        }
    }

    deleteObject(object) {
        const index = this.placedObjects.findIndex(obj => obj.id === object.id);
        if (index !== -1) {
            this.placedObjects.splice(index, 1);
            object.element.remove();
            this.selectedObject = null;
            this.updatePlacedObjectsList();
        }
    }

    updatePlacedObjectsList() {
        const list = document.getElementById('placedObjectsList');
        list.innerHTML = '';
        
        const icons = {
            router: '🔄',
            switch: '🔀',
            server: '🖥️',
            pc: '💻',
            firewall: '🔥'
        };
        
        const labels = {
            router: 'Маршрутизатор',
            switch: 'Коммутатор',
            server: 'Сервер',
            pc: 'Компьютер',
            firewall: 'Фаервол'
        };
        
        this.placedObjects.forEach(obj => {
            const item = document.createElement('div');
            item.className = 'placed-object-item';
            item.innerHTML = `
                <span class="icon">${icons[obj.type]}</span>
                <span>${labels[obj.type]} (${obj.x}, ${obj.y})</span>
            `;
            list.appendChild(item);
        });
    }

    exportToJSON() {
        const exportData = {
            version: "1.0",
            createdAt: new Date().toISOString(),
            objects: this.placedObjects.map(obj => ({
                id: obj.id,
                type: obj.type,
                x: obj.x,
                y: obj.y
            })),
            connections: this.connections.map(conn => ({
                from: conn.from,
                to: conn.to,
                type: conn.type
            }))
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: "application/json" });
        
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `network-diagram-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('Схема экспортирована:', exportData);
        alert('Схема успешно экспортирована в JSON файл!');
    }

    importFromJSON(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                this.placedObjects.forEach(obj => {
                    if (obj.element) obj.element.remove();
                });
                this.placedObjects = [];
                this.connections = [];
                this.selectedObject = null;
                this.multiSelectedObjects = [];
                
                data.objects.forEach(objData => {
                    this.createObjectFromData(objData);
                });

                if (data.connections) {
                    data.connections.forEach(connData => {
                        this.connections.push({
                            id: 'conn_' + Date.now(),
                            from: connData.from,
                            to: connData.to,
                            type: connData.type
                        });
                    });
                    this.renderConnections();
                    this.updateConnectionsList();
                }
                
                this.updatePlacedObjectsList();
                this.saveState();
                console.log('Схема импортирована:', data);
                alert(`Схема успешно импортирована! Загружено объектов: ${data.objects.length}, соединений: ${data.connections ? data.connections.length : 0}`);
                
            } catch (error) {
                console.error('Ошибка импорта:', error);
                alert('Ошибка при импорте файла. Проверьте формат файла.');
            }
        };
        
        reader.readAsText(file);
    }

    createObjectFromData(objData) {
        const object = {
            id: objData.id,
            type: objData.type,
            x: objData.x,
            y: objData.y,
            element: null,
            connectionPoint: null
        };

        this.placedObjects.push(object);
        this.renderObject(object);
    }

    clearWorkspace() {
        if (confirm('Вы уверены, что хотите очистить всё поле? Все объекты и соединения будут удалены.')) {
            this.placedObjects.forEach(obj => {
                if (obj.element) obj.element.remove();
            });
            this.placedObjects = [];
            this.connections = [];
            this.selectedObject = null;
            this.multiSelectedObjects = [];
            this.updatePlacedObjectsList();
            this.updateConnectionsList();
            this.renderConnections();
            this.saveState();
            console.log('Рабочее поле очищено');
        }
    }

    saveState() {
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }

        const state = {
            objects: this.placedObjects.map(obj => ({
                id: obj.id,
                type: obj.type,
                x: obj.x,
                y: obj.y
            })),
            connections: this.connections.map(conn => ({
                from: conn.from,
                to: conn.to,
                type: conn.type
            }))
        };

        this.history.push(JSON.stringify(state));
        this.historyIndex++;

        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.historyIndex--;
        }

        console.log('Состояние сохранено. История:', this.history.length, 'Текущий индекс:', this.historyIndex);
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState();
            console.log('Отмена действия. Новый индекс:', this.historyIndex);
        } else {
            console.log('Нет действий для отмены');
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState();
            console.log('Повтор действия. Новый индекс:', this.historyIndex);
        } else {
            console.log('Нет действий для повтора');
        }
    }

    restoreState() {
        const state = JSON.parse(this.history[this.historyIndex]);
        
        this.placedObjects.forEach(obj => {
            if (obj.element) obj.element.remove();
        });
        this.placedObjects = [];
        this.connections = [];
        this.selectedObject = null;
        this.multiSelectedObjects = [];

        state.objects.forEach(objData => {
            const object = {
                id: objData.id,
                type: objData.type,
                x: objData.x,
                y: objData.y,
                element: null,
                connectionPoint: null
            };
            this.placedObjects.push(object);
            this.renderObject(object);
        });

        if (state.connections) {
            state.connections.forEach(connData => {
                this.connections.push({
                    id: 'conn_' + Date.now(),
                    from: connData.from,
                    to: connData.to,
                    type: connData.type
                });
            });
            this.renderConnections();
            this.updateConnectionsList();
        }

        this.updatePlacedObjectsList();
        console.log('Состояние восстановлено. Объектов:', this.placedObjects.length, 'Соединений:', this.connections.length);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, запускаем приложение...');
    new NetworkDiagram();
});