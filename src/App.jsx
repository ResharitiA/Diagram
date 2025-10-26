import React, { useState, useRef, useEffect, useCallback } from 'react';

const NetworkDiagram = () => {
  // Состояния
  const [objects, setObjects] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedCableType, setSelectedCableType] = useState('logical');
  const [selectedObjectIds, setSelectedObjectIds] = useState([]);
  const [objectCounters, setObjectCounters] = useState({
    server: 0, firewall: 0, loadbalancer: 0, service: 0, container: 0, network: 0
  });
  // Пан и зум (scale в пикселях и пан в экранных пикселях)
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Для редактирования имени
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  // Для выделения рамкой
  const [selectionRect, setSelectionRect] = useState(null);
  const isSelectingRef = useRef(false);
  const selectionStartRef = useRef({ x: 0, y: 0 });
  const shiftPressedRef = useRef(false);
  // Для валидации и свойств
  const [validationMessages, setValidationMessages] = useState([]);
  const [selectedObject, setSelectedObject] = useState(null);

  // Правильные константы для объектов
  const OBJECT_TYPES = {
    server: { 
      label: 'Сервер', 
      icon: '🖥️', 
      color: '#e8f5e8',
      properties: {
        ip: { label: 'IP адрес', value: '192.168.1.1', editable: true },
        os: { label: 'ОС', value: 'Linux', editable: true },
        cpu: { label: 'Процессор', value: '4 cores', editable: true },
        ram: { label: 'Память', value: '8GB', editable: true }
      }
    },
    firewall: { 
      label: 'Фаервол', 
      icon: '🔥', 
      color: '#ffebee',
      properties: {
        rules: { label: 'Правила', value: 'Default deny', editable: true },
        zones: { label: 'Зоны', value: 'DMZ, Internal', editable: true },
        throughput: { label: 'Пропускная способность', value: '1Gbps', editable: true }
      }
    },
    loadbalancer: { 
      label: 'Балансировщик', 
      icon: '⚖️', 
      color: '#fff3cd',
      properties: {
        algorithm: { label: 'Алгоритм', value: 'Round Robin', editable: true },
        healthCheck: { label: 'Проверка здоровья', value: '/health', editable: true },
        ssl: { label: 'SSL', value: 'Enabled', editable: true }
      }
    },
    service: { 
      label: 'Сервис', 
      icon: '⚙️', 
      color: '#cfe2ff',
      properties: {
        port: { label: 'Порт', value: '8080', editable: true },
        protocol: { label: 'Протокол', value: 'HTTP', editable: true },
        version: { label: 'Версия', value: '1.0', editable: true }
      }
    },
    container: { 
      label: 'Контейнер', 
      icon: '📦', 
      color: '#d1e7dd',
      properties: {
        image: { label: 'Образ', value: 'nginx:latest', editable: true },
        ports: { label: 'Порты', value: '80:80', editable: true },
        environment: { label: 'Окружение', value: 'production', editable: true }
      }
    },
    network: { 
      label: 'Сеть', 
      icon: '🌐', 
      color: '#f8d7da',
      properties: {
        subnet: { label: 'Подсеть', value: '192.168.0.0/24', editable: true },
        gateway: { label: 'Шлюз', value: '192.168.0.1', editable: true },
        dns: { label: 'DNS', value: '8.8.8.8', editable: true }
      }
    }
  };

  // Правильные константы для кабелей
  const CABLE_TYPES = {
    logical: { label: 'Соединение', icon: '➡️', color: '#6c757d' }
  };

  // Правила валидации соединений
  const VALID_CONNECTIONS = {
    server: ['container', 'network', 'firewall', 'loadbalancer'],
    firewall: ['network', 'server', 'firewall'], // Разрешаем firewall+firewall
    loadbalancer: ['service', 'container', 'network'],
    service: ['container', 'network', 'loadbalancer'],
    container: ['network', 'server', 'service', 'loadbalancer'],
    network: ['server', 'container', 'firewall', 'loadbalancer', 'network']
  };

  // Рефы
  const svgRef = useRef();
  const isConnectingRef = useRef(false);
  const connectionStartRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ startX: 0, startY: 0, origPan: { x: 0, y: 0 } });
  // Буфер обмена и undo/redo
  const clipboardRef = useRef([]);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  // Добавление сообщения валидации
  const addValidationMessage = useCallback((message, type = 'error') => {
    const id = Date.now() + Math.random();
    setValidationMessages(prev => [...prev, { id, message, type }]);
  }, []);

  // Удаление сообщения валидации
  const removeValidationMessage = useCallback((id) => {
    setValidationMessages(prev => prev.filter(msg => msg.id !== id));
  }, []);

  // Валидация соединения
  const validateConnection = (fromType, toType) => {
    const validTargets = VALID_CONNECTIONS[fromType];
    if (!validTargets) {
      return { isValid: false, message: `Неизвестный тип источника: ${fromType}` };
    }
    
    // Специальная проверка для firewall+firewall
    if (fromType === 'firewall' && toType === 'firewall') {
      return { 
        isValid: true, 
        warning: 'Соединение Фаервол-Фаервол не рекомендуется в большинстве сценариев' 
      };
    }
    
    if (!validTargets.includes(toType)) {
      const fromLabel = OBJECT_TYPES[fromType]?.label || fromType;
      const toLabel = OBJECT_TYPES[toType]?.label || toType;
      return { 
        isValid: false, 
        message: `Недопустимое соединение: ${fromLabel} не может быть подключен к ${toLabel}` 
      };
    }
    
    return { isValid: true };
  };

  // Проверка топологии
  const validateTopology = () => {
    const errors = [];
    const warnings = [];
    
    // Проверяем контейнеры - должны быть подключены к сети
    objects.forEach(obj => {
      if (obj.type === 'container') {
        const hasNetworkConnection = connections.some(conn => 
          (conn.from === obj.id || conn.to === obj.id) && 
          objects.find(o => o.id === (conn.from === obj.id ? conn.to : conn.from))?.type === 'network'
        );
        
        if (!hasNetworkConnection) {
          errors.push(`Контейнер "${obj.name}" не подключен к сети`);
        }
      }
    });

    // Проверяем сервисы - должны быть подключены к контейнерам
    objects.forEach(obj => {
      if (obj.type === 'service') {
        const hasContainerConnection = connections.some(conn => 
          (conn.from === obj.id || conn.to === obj.id) && 
          objects.find(o => o.id === (conn.from === obj.id ? conn.to : conn.from))?.type === 'container'
        );
        
        if (!hasContainerConnection) {
          errors.push(`Сервис "${obj.name}" не подключен к контейнеру`);
        }
      }
    });

    // Проверяем соединения firewall+firewall
    connections.forEach(conn => {
      const fromObj = objects.find(obj => obj.id === conn.from);
      const toObj = objects.find(obj => obj.id === conn.to);
      if (fromObj && toObj && fromObj.type === 'firewall' && toObj.type === 'firewall') {
        warnings.push(`Соединение Фаервол-Фаервол: "${fromObj.name}" -> "${toObj.name}"`);
      }
    });

    return { errors, warnings };
  };

  // Сохраняем состояние для undo
  const pushUndo = useCallback(() => {
    undoStackRef.current.push({
      objects: JSON.parse(JSON.stringify(objects)),
      connections: JSON.parse(JSON.stringify(connections)),
      selectedObjectIds: [...selectedObjectIds],
      objectCounters: { ...objectCounters }
    });
    redoStackRef.current = [];
  }, [objects, connections, selectedObjectIds, objectCounters]);

  // Undo
  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const last = undoStackRef.current.pop();
    redoStackRef.current.push({
      objects,
      connections,
      selectedObjectIds,
      objectCounters
    });
    setObjects(last.objects);
    setConnections(last.connections);
    setSelectedObjectIds(last.selectedObjectIds);
    setObjectCounters(last.objectCounters);
  }, [objects, connections, selectedObjectIds, objectCounters]);

  // Redo
  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop();
    undoStackRef.current.push({
      objects,
      connections,
      selectedObjectIds,
      objectCounters
    });
    setObjects(next.objects);
    setConnections(next.connections);
    setSelectedObjectIds(next.selectedObjectIds);
    setObjectCounters(next.objectCounters);
  }, [objects, connections, selectedObjectIds, objectCounters]);

  // Копировать
  const handleCopy = useCallback(() => {
    if (selectedObjectIds.length === 0) return;
    const copiedObjects = objects.filter(obj => selectedObjectIds.includes(obj.id));
    clipboardRef.current = copiedObjects.map(obj => ({ ...obj }));
  }, [objects, selectedObjectIds]);

  // Вырезать
  const handleCut = useCallback(() => {
    if (selectedObjectIds.length === 0) return;
    pushUndo();
    const cutObjects = objects.filter(obj => selectedObjectIds.includes(obj.id));
    clipboardRef.current = cutObjects.map(obj => ({ ...obj }));
    setObjects(prev => prev.filter(obj => !selectedObjectIds.includes(obj.id)));
    setConnections(prev => prev.filter(conn =>
      !selectedObjectIds.includes(conn.from) && !selectedObjectIds.includes(conn.to)
    ));
    setSelectedObjectIds([]);
  }, [objects, selectedObjectIds, pushUndo]);

  // Вставить
  const handlePaste = useCallback(() => {
    if (!clipboardRef.current.length) return;
    pushUndo();
    const pasted = clipboardRef.current.map(obj => ({
      ...obj,
      id: 'obj_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      x: obj.x + 30,
      y: obj.y + 30
    }));
    setObjects(prev => [...prev, ...pasted]);
    setSelectedObjectIds(pasted.map(obj => obj.id));
  }, [pushUndo]);

  // Создание объекта
  const createObject = useCallback((type, x, y) => {
    pushUndo();
    const id = 'obj_' + Date.now();
    const newObject = {
      id,
      type,
      x,
      y,
      name: OBJECT_TYPES[type].label,
      number: objectCounters[type] + 1,
      properties: JSON.parse(JSON.stringify(OBJECT_TYPES[type].properties))
    };
    setObjects(prev => [...prev, newObject]);
    setObjectCounters(prev => ({ ...prev, [type]: prev[type] + 1 }));
    setSelectedObjectIds([id]);
    setSelectedObject(newObject);
  }, [OBJECT_TYPES, objectCounters, pushUndo]);

  // Создание соединения
  const createConnection = useCallback((fromId, toId, type) => {
    const fromObj = objects.find(obj => obj.id === fromId);
    const toObj = objects.find(obj => obj.id === toId);
    
    if (!fromObj || !toObj) return false;

    // Валидация соединения
    const validation = validateConnection(fromObj.type, toObj.type);
    if (!validation.isValid) {
      addValidationMessage(validation.message, 'error');
      return false;
    }

    // Показываем предупреждение если есть
    if (validation.warning) {
      addValidationMessage(validation.warning, 'warning');
    }

    pushUndo();
    const id = 'conn_' + Date.now();
    const newConnection = { id, from: fromId, to: toId, type };
    
    const exists = connections.some(conn => 
      (conn.from === fromId && conn.to === toId) || 
      (conn.from === toId && conn.to === fromId)
    );
    
    if (!exists) {
      setConnections(prev => [...prev, newConnection]);
      
      // Проверяем топологию после создания соединения
      const topologyValidation = validateTopology();
      topologyValidation.errors.forEach(error => addValidationMessage(error, 'error'));
      topologyValidation.warnings.forEach(warning => addValidationMessage(warning, 'warning'));
      
      return true;
    }
    return false;
  }, [objects, connections, pushUndo, addValidationMessage]);

  // Обновление свойств объекта
  const updateObjectProperty = (objectId, property, value) => {
    setObjects(prev => prev.map(obj => 
      obj.id === objectId 
        ? { 
            ...obj, 
            properties: { 
              ...obj.properties, 
              [property]: { ...obj.properties[property], value } 
            } 
          }
        : obj
    ));
    
    // Обновляем selectedObject если он редактируется
    if (selectedObject && selectedObject.id === objectId) {
      setSelectedObject(prev => ({
        ...prev,
        properties: { 
          ...prev.properties, 
          [property]: { ...prev.properties[property], value } 
        }
      }));
    }
  };

  // Обработчики событий (остаются без изменений, кроме небольших правок)
  const handleWorkspaceMouseDown = (e) => {
    if (e.button === 1) {
      isPanningRef.current = true;
      panStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origPan: { ...pan }
      };
      if (svgRef.current) svgRef.current.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    if (e.button === 0 && !e.target.closest('.network-object')) {
      const rect = svgRef.current.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - pan.x) / scale;
      const worldY = (e.clientY - rect.top - pan.y) / scale;
      
      isSelectingRef.current = true;
      selectionStartRef.current = { x: worldX, y: worldY };
      setSelectionRect({ x1: worldX, y1: worldY, x2: worldX, y2: worldY });
      
      if (!e.shiftKey) {
        setSelectedObjectIds([]);
        setSelectedObject(null);
      }
      
      e.preventDefault();
      return;
    }
  };

  const handleObjectMouseDown = (e, object) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    
    const rect = svgRef.current.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - pan.x) / scale;
    const worldY = (e.clientY - rect.top - pan.y) / scale;

    dragStartRef.current = {
      offsetX: worldX - object.x,
      offsetY: worldY - object.y,
      object
    };

    if (!selectedObjectIds.includes(object.id) && !e.shiftKey) {
      setSelectedObjectIds([object.id]);
      setSelectedObject(object);
    } else if (e.shiftKey) {
      setSelectedObjectIds(prev => 
        prev.includes(object.id) 
          ? prev.filter(id => id !== object.id)
          : [...prev, object.id]
      );
      if (selectedObjectIds.length === 1 && selectedObjectIds[0] === object.id) {
        setSelectedObject(null);
      } else {
        setSelectedObject(object);
      }
    }
  };

  const handleMouseMove = (e) => {
    if (isDraggingRef.current && dragStartRef.current && selectedObjectIds.length > 0) {
      const { offsetX, offsetY } = dragStartRef.current;
      const rect = svgRef.current.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - pan.x) / scale;
      const worldY = (e.clientY - rect.top - pan.y) / scale;

      const deltaX = worldX - offsetX - dragStartRef.current.object.x;
      const deltaY = worldY - offsetY - dragStartRef.current.object.y;

      setObjects(prev => prev.map(obj => 
        selectedObjectIds.includes(obj.id)
          ? { ...obj, x: obj.x + deltaX, y: obj.y + deltaY }
          : obj
      ));
      
      dragStartRef.current.object.x += deltaX;
      dragStartRef.current.object.y += deltaY;
      return;
    }

    if (isSelectingRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - pan.x) / scale;
      const worldY = (e.clientY - rect.top - pan.y) / scale;
      setSelectionRect(prev => ({ 
        x1: selectionStartRef.current.x, 
        y1: selectionStartRef.current.y, 
        x2: worldX, 
        y2: worldY 
      }));
      return;
    }

    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.startX;
      const dy = e.clientY - panStartRef.current.startY;
      const newPan = {
        x: panStartRef.current.origPan.x + dx,
        y: panStartRef.current.origPan.y + dy
      };
      setPan(newPan);
      return;
    }
  };

  const handleMouseUp = (e) => {
    if (isSelectingRef.current && selectionRect) {
      const { x1, y1, x2, y2 } = selectionRect;
      
      if (Math.abs(x2 - x1) > 5 && Math.abs(y2 - y1) > 5) {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        
        const selected = objects.filter(obj => {
          const objCenterX = obj.x + 40;
          const objCenterY = obj.y + 40;
          return objCenterX >= minX && objCenterX <= maxX && 
                 objCenterY >= minY && objCenterY <= maxY;
        }).map(obj => obj.id);

        if (e.shiftKey) {
          setSelectedObjectIds(prev => {
            const newSelection = [...prev];
            selected.forEach(id => {
              if (!newSelection.includes(id)) {
                newSelection.push(id);
              }
            });
            return newSelection;
          });
        } else {
          setSelectedObjectIds(selected);
        }
        
        if (selected.length === 1) {
          setSelectedObject(objects.find(obj => obj.id === selected[0]));
        } else {
          setSelectedObject(null);
        }
      }
      
      setSelectionRect(null);
      isSelectingRef.current = false;
    }
    
    isDraggingRef.current = false;
    dragStartRef.current = null;
    
    if (isPanningRef.current) {
      isPanningRef.current = false;
      if (svgRef.current) svgRef.current.style.cursor = '';
    }
  };

  // Преобразование экранных координат в мировые
  const screenToWorld = (clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / scale,
      y: (clientY - rect.top - pan.y) / scale
    };
  };

  // Обработка колеса мыши
  const handleWheel = (e) => {
    if (!svgRef.current) return;
    e.preventDefault();

    const rect = svgRef.current.getBoundingClientRect();

    if (e.ctrlKey) {
      const worldBefore = {
        x: (e.clientX - rect.left - pan.x) / scale,
        y: (e.clientY - rect.top - pan.y) / scale
      };
      
      const zoomFactor = Math.exp(-e.deltaY * 0.0015);
      const newScale = Math.max(0.2, Math.min(3, scale * zoomFactor));

      const newPanX = (e.clientX - rect.left) - worldBefore.x * newScale;
      const newPanY = (e.clientY - rect.top) - worldBefore.y * newScale;

      setScale(newScale);
      setPan({ x: newPanX, y: newPanY });
    } else {
      if (e.shiftKey) {
        setPan(prev => ({ x: prev.x - e.deltaY, y: prev.y }));
      } else {
        setPan(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    }
  };

  const zoomCentered = (factor) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const centerClientX = rect.left + rect.width / 2;
    const centerClientY = rect.top + rect.height / 2;
    const worldBefore = screenToWorld(centerClientX, centerClientY);
    const newScale = Math.max(0.2, Math.min(3, scale * factor));
    const newPanX = (centerClientX - rect.left) - worldBefore.x * newScale;
    const newPanY = (centerClientY - rect.top) - worldBefore.y * newScale;
    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  };

  const zoomIn = () => zoomCentered(1.1);
  const zoomOut = () => zoomCentered(1 / 1.1);
  const zoomReset = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  const startConnection = (object) => {
    if (!selectedCableType) {
      addValidationMessage('Сначала выберите тип подключения!', 'error');
      return;
    }
    isConnectingRef.current = true;
    connectionStartRef.current = object;
  };

  const finishConnection = (targetObject) => {
    if (!isConnectingRef.current || !connectionStartRef.current) return;
    
    const fromObject = connectionStartRef.current;
    if (fromObject.id === targetObject.id) return;
    
    createConnection(fromObject.id, targetObject.id, selectedCableType);
    
    isConnectingRef.current = false;
    connectionStartRef.current = null;
  };

  const handleObjectClick = (e, object) => {
    e.stopPropagation();
    if (isConnectingRef.current && connectionStartRef.current) {
      finishConnection(object);
      return;
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain');
    const rect = svgRef.current.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - pan.x) / scale;
    const worldY = (e.clientY - rect.top - pan.y) / scale;
    const x = worldX - 40;
    const y = worldY - 40;
    createObject(type, x, y);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const deleteSelectedObjects = () => {
    if (selectedObjectIds.length === 0) return;
    
    if (window.confirm(`Удалить ${selectedObjectIds.length} объектов?`)) {
      pushUndo();
      setObjects(prev => prev.filter(obj => !selectedObjectIds.includes(obj.id)));
      setConnections(prev => prev.filter(conn => 
        !selectedObjectIds.includes(conn.from) && !selectedObjectIds.includes(conn.to)
      ));
      setSelectedObjectIds([]);
      setSelectedObject(null);
    }
  };

  const clearWorkspace = () => {
    if (window.confirm('Очистить всё поле?')) {
      pushUndo();
      setObjects([]);
      setConnections([]);
      setSelectedObjectIds([]);
      setSelectedObject(null);
      setObjectCounters({
        server: 0, firewall: 0, loadbalancer: 0, service: 0, container: 0, network: 0
      });
      setValidationMessages([]);
    }
  };

  const exportToJSON = () => {
    const topologyValidation = validateTopology();
    if (topologyValidation.errors.length > 0) {
      if (!window.confirm(`Обнаружены ошибки в топологии: ${topologyValidation.errors.join(', ')}. Продолжить экспорт?`)) {
        return;
      }
    }

    const data = {
      objects: objects,
      connections: connections,
      objectCounters: objectCounters
    };
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'network-diagram.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFromJSON = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        pushUndo();
        setObjects(data.objects || []);
        setConnections(data.connections || []);
        setObjectCounters(data.objectCounters || {
          server: 0, firewall: 0, loadbalancer: 0, service: 0, container: 0, network: 0
        });
        setSelectedObjectIds([]);
        setSelectedObject(null);
        setValidationMessages([]);
        
        // Проверяем топологию после импорта
        const topologyValidation = validateTopology();
        topologyValidation.errors.forEach(error => addValidationMessage(error, 'error'));
        topologyValidation.warnings.forEach(warning => addValidationMessage(warning, 'warning'));
        
        alert('Схема загружена!');
      } catch (error) {
        alert('Ошибка при загрузке файла');
      }
    };
    reader.readAsText(file);
  };

  // Рендер соединения
  const renderConnection = (connection) => {
    const fromObj = objects.find(obj => obj.id === connection.from);
    const toObj = objects.find(obj => obj.id === connection.to);
    
    if (!fromObj || !toObj) return null;
    
    const fromX = fromObj.x + 40;
    const fromY = fromObj.y + 40;
    const toX = toObj.x + 40;
    const toY = toObj.y + 40;
    
    return (
      <line
        key={connection.id}
        x1={fromX}
        y1={fromY}
        x2={toX}
        y2={toY}
        stroke={CABLE_TYPES[connection.type].color}
        strokeWidth="3"
        markerEnd="url(#arrowhead)"
      />
    );
  };

  // Рендер объекта
  const renderObject = (object) => {
    const isSelected = selectedObjectIds.includes(object.id);
    const isEditing = editingId === object.id;

    return (
      <g
        key={object.id}
        className={`network-object ${isSelected ? 'selected' : ''}`}
        transform={`translate(${object.x}, ${object.y})`}
        onMouseDown={(e) => handleObjectMouseDown(e, object)}
        onClick={(e) => handleObjectClick(e, object)}
        style={{ cursor: 'move' }}
      >
        <rect
          width="80"
          height="80"
          rx="8"
          fill="white"
          stroke={isSelected ? '#ff6b6b' : '#007bff'}
          strokeWidth={isSelected ? '3' : '2'}
        />
        <text
          x="40"
          y="35"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="24"
        >
          {OBJECT_TYPES[object.type].icon}
        </text>
        {isEditing ? (
          <foreignObject x="10" y="50" width="60" height="24">
            <input
              type="text"
              value={editingValue}
              autoFocus
              style={{ width: '100%', fontSize: '12px', textAlign: 'center', borderRadius: 4, border: '1px solid #007bff', padding: '2px' }}
              onChange={e => setEditingValue(e.target.value)}
              onBlur={() => {
                setObjects(prev => prev.map(obj => obj.id === object.id ? { ...obj, name: editingValue } : obj));
                setEditingId(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setObjects(prev => prev.map(obj => obj.id === object.id ? { ...obj, name: editingValue } : obj));
                  setEditingId(null);
                }
                if (e.key === 'Escape') {
                  setEditingId(null);
                }
              }}
            />
          </foreignObject>
        ) : (
          <text
            x="40"
            y="60"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="10"
            fontWeight="500"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={e => {
              e.stopPropagation();
              setEditingId(object.id);
              setEditingValue(object.name);
            }}
          >
            {object.name} №{object.number}
          </text>
        )}
        <circle
          cx="40"
          cy="40"
          r="6"
          fill="#20c997"
          stroke="white"
          strokeWidth="2"
          style={{ opacity: isSelected ? 1 : 0 }}
          className="connection-point"
          onMouseDown={(e) => {
            e.stopPropagation();
            startConnection(object);
          }}
        />
      </g>
    );
  };

  // Рендер свойств объекта с двумя колонками
  const renderObjectProperties = () => {
    if (!selectedObject) return null;

    const properties = selectedObject.properties || {};
    
    return (
      <div className="properties-panel">
        <h4>Свойства {OBJECT_TYPES[selectedObject.type].label}</h4>
        <div className="properties-grid">
          {Object.entries(properties).map(([key, propConfig]) => (
            <React.Fragment key={key}>
              <div className="property-label">{propConfig.label}:</div>
              <div className="property-value">
                {propConfig.editable ? (
                  <input
                    type="text"
                    value={propConfig.value}
                    onChange={(e) => updateObjectProperty(selectedObject.id, key, e.target.value)}
                    placeholder={`Введите ${propConfig.label}`}
                  />
                ) : (
                  <span>{propConfig.value}</span>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  // Рендер сообщений валидации
  const renderValidationMessages = () => {
    if (validationMessages.length === 0) return null;

    return (
      <div className="validation-messages">
        <div className="validation-header">
          <h4>Сообщения системы</h4>
          <button 
            className="close-all-btn"
            onClick={() => setValidationMessages([])}
          >
            Закрыть все
          </button>
        </div>
        {validationMessages.map(msg => (
          <div 
            key={msg.id} 
            className={`validation-message ${msg.type}`}
          >
            <div className="message-content">
              {msg.type === 'error' ? '❌' : '⚠️'} {msg.message}
            </div>
            <button 
              className="close-btn"
              onClick={() => removeValidationMessage(msg.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    );
  };

  // Эффекты
  useEffect(() => {
    const handleKeyDown = (e) => {
      shiftPressedRef.current = e.shiftKey;
      
      const ctrl = e.ctrlKey || e.metaKey;
      switch (e.code) {
        case 'Delete':
          deleteSelectedObjects();
          break;
        case 'KeyC':
          if (ctrl) {
            e.preventDefault();
            handleCopy();
          }
          break;
        case 'KeyX':
          if (ctrl) {
            e.preventDefault();
            handleCut();
          }
          break;
        case 'KeyV':
          if (ctrl) {
            e.preventDefault();
            handlePaste();
          }
          break;
        case 'KeyZ':
          if (ctrl) {
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
          }
          break;
        case 'KeyY':
          if (ctrl) {
            e.preventDefault();
            handleRedo();
          }
          break;
        case 'KeyA':
          if (ctrl) {
            e.preventDefault();
            setSelectedObjectIds(objects.map(obj => obj.id));
          }
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Shift') {
        shiftPressedRef.current = false;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [selectedObjectIds, handleCopy, handleCut, handlePaste, handleUndo, handleRedo, objects, deleteSelectedObjects]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const nativeWheelHandler = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    svg.addEventListener('wheel', nativeWheelHandler, { passive: false });

    return () => {
      svg.removeEventListener('wheel', nativeWheelHandler, { passive: false });
    };
  }, []);

  return (
    <div className="container">
      {/* Валидационные сообщения */}
      {renderValidationMessages()}

      {/* Панель доступных объектов */}
      <div className="objects-panel">
        <h3>Доступные объекты</h3>
        {Object.entries(OBJECT_TYPES).map(([type, { label, icon, color }]) => (
          <div
            key={type}
            className="object-item"
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', type)}
          >
            <div className="object-icon" style={{ background: color }}>
              {icon}
            </div>
            <span>{label}</span>
          </div>
        ))}
        
        <h3 style={{ marginTop: '20px' }}>Подключение</h3>
        {Object.entries(CABLE_TYPES).map(([type, { label, icon, color }]) => (
          <div
            key={type}
            className={`cable-item ${selectedCableType === type ? 'selected' : ''}`}
            onClick={() => setSelectedCableType(type)}
          >
            <div className="cable-icon" style={{ background: color }}>
              {icon}
            </div>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Рабочая область */}
      <div className="workspace">
        <svg
          ref={svgRef}
          className="workspace-svg"
          onMouseDown={handleWorkspaceMouseDown}
          onWheel={handleWheel}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
            </marker>
          </defs>
          
          <pattern
            id="grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="rgba(0,0,0,0.1)"
              strokeWidth="1"
            />
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {selectionRect && (
              <rect
                className="selection-rect"
                x={Math.min(selectionRect.x1, selectionRect.x2)}
                y={Math.min(selectionRect.y1, selectionRect.y2)}
                width={Math.abs(selectionRect.x2 - selectionRect.x1)}
                height={Math.abs(selectionRect.y2 - selectionRect.y1)}
                fill="rgba(0,123,255,0.1)"
                stroke="#007bff"
                strokeDasharray="4"
                strokeWidth="2"
              />
            )}
            {connections.map(renderConnection)}
            {objects.map(renderObject)}
          </g>
        </svg>
        <div className="zoom-controls" role="group" aria-label="Zoom controls">
          <button className="zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
          <div className="zoom-level">{Math.round(scale * 100)}%</div>
          <button className="zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
          <button className="zoom-btn" onClick={zoomReset} title="Reset">⟳</button>
        </div>
      </div>

      {/* Панель размещенных объектов и свойств */}
      <div className="placed-objects">
        {selectedObject ? (
          <>
            <h3>Свойства: {selectedObject.name}</h3>
            {renderObjectProperties()}
          </>
        ) : (
          <>
            <h3>Размещенные объекты ({objects.length})</h3>
            <div>
              {objects.map(obj => (
                <div 
                  key={obj.id} 
                  className={`placed-object-item ${selectedObjectIds.includes(obj.id) ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedObjectIds([obj.id]);
                    setSelectedObject(obj);
                  }}
                >
                  <span className="icon">{OBJECT_TYPES[obj.type].icon}</span>
                  <span>{obj.name} №{obj.number}</span>
                </div>
              ))}
            </div>
            
            <h3 style={{ marginTop: '20px' }}>Соединения ({connections.length})</h3>
            <div>
              {connections.map(conn => {
                const fromObj = objects.find(obj => obj.id === conn.from);
                const toObj = objects.find(obj => obj.id === conn.to);
                return fromObj && toObj ? (
                  <div key={conn.id} className="connection-item">
                    <div className="cable-icon" style={{ background: CABLE_TYPES[conn.type].color }}>
                      {CABLE_TYPES[conn.type].icon}
                    </div>
                    <span>{fromObj.name} → {toObj.name}</span>
                  </div>
                ) : null;
              })}
            </div>
          </>
        )}
      </div>

      {/* Панель управления */}
      <div className="control-panel">
        <h3>Управление</h3>
        <button className="control-btn" onClick={exportToJSON}>
          💾 Экспорт в JSON
        </button>
        <input
          type="file"
          id="importFile"
          accept=".json"
          style={{ display: 'none' }}
          onChange={importFromJSON}
        />
        <button 
          className="control-btn" 
          onClick={() => document.getElementById('importFile').click()}
        >
          📁 Импорт из JSON
        </button>
        <button className="control-btn" onClick={deleteSelectedObjects}>
          🗑️ Удалить выбранное
        </button>
        <button className="control-btn clear" onClick={clearWorkspace}>
          🗑️ Очистить поле
        </button>
        
        <div className="current-cable">
          <span>Текущее подключение: {CABLE_TYPES[selectedCableType]?.label}</span>
        </div>
      </div>
    </div>
  );
};

export default NetworkDiagram;