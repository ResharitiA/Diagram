import React, { useState, useRef, useEffect, useCallback } from 'react';

const NetworkDiagram = () => {
  // Состояния
  const [objects, setObjects] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedCableType, setSelectedCableType] = useState('ethernet');
  const [selectedObjectIds, setSelectedObjectIds] = useState([]);
  const [objectCounters, setObjectCounters] = useState({
    router: 0, switch: 0, server: 0, pc: 0, firewall: 0
  });
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  // Рефы
  const svgRef = useRef();
  const tempLineRef = useRef();
  const selectionRectRef = useRef();
  const isConnectingRef = useRef(false);
  const connectionStartRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const isSelectingRef = useRef(false);
  const selectionStartRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const copiedObjectsRef = useRef([]);

  // Константы
  const OBJECT_TYPES = {
    router: { label: 'Маршрутизатор', icon: '🔄', color: '#e3f2fd' },
    switch: { label: 'Коммутатор', icon: '🔀', color: '#f3e5f5' },
    server: { label: 'Сервер', icon: '🖥️', color: '#e8f5e8' },
    pc: { label: 'Компьютер', icon: '💻', color: '#fff3e0' },
    firewall: { label: 'Фаервол', icon: '🔥', color: '#ffebee' }
  };

  const CABLE_TYPES = {
    ethernet: { label: 'Ethernet', icon: '🔗', color: '#28a745' },
    fiber: { label: 'Оптоволокно', icon: '🔆', color: '#6f42c1' },
    coaxial: { label: 'Коаксиальный', icon: '⛓️', color: '#fd7e14' },
    serial: { label: 'Последовательный', icon: '🔌', color: '#17a2b8' }
  };

  // Создание нового объекта
  const createObject = useCallback((type, x, y, name = null, number = null) => {
    const id = `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const label = name || OBJECT_TYPES[type].label;
    
    let newNumber = number;
    if (number === null) {
      newNumber = objectCounters[type] + 1;
      setObjectCounters(prev => ({ ...prev, [type]: newNumber }));
    }
    
    const newObject = {
      id, type, x, y, name: label, number: newNumber
    };
    
    setObjects(prev => [...prev, newObject]);
    return newObject;
  }, [objectCounters, OBJECT_TYPES]);

  // Удаление объекта
  const deleteObject = useCallback((id) => {
    setObjects(prev => prev.filter(obj => obj.id !== id));
    setConnections(prev => prev.filter(conn => 
      conn.from !== id && conn.to !== id
    ));
    setSelectedObjectIds(prev => prev.filter(objId => objId !== id));
  }, []);

  // Создание соединения
  const createConnection = useCallback((fromId, toId, type) => {
    const id = `conn_${Date.now()}`;
    const newConnection = { id, from: fromId, to: toId, type };
    
    // Проверяем, не существует ли уже такое соединение
    const exists = connections.some(conn => 
      (conn.from === fromId && conn.to === toId) || 
      (conn.from === toId && conn.to === fromId)
    );
    
    if (!exists) {
      setConnections(prev => [...prev, newConnection]);
      return true;
    }
    return false;
  }, [connections]);

  // Выделение объекта
  const selectObject = useCallback((id, isShiftPressed = false) => {
    if (isShiftPressed) {
      setSelectedObjectIds(prev => 
        prev.includes(id) 
          ? prev.filter(objId => objId !== id)
          : [...prev, id]
      );
    } else {
      setSelectedObjectIds([id]);
    }
  }, []);

  // Начало перетаскивания объекта
  const startDragging = useCallback((e, object) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    dragStartRef.current = { 
      x: e.clientX - object.x, 
      y: e.clientY - object.y,
      object
    };
    
    // Если объект не выделен, выделяем его
    if (!selectedObjectIds.includes(object.id)) {
      setSelectedObjectIds([object.id]);
    }
  }, [selectedObjectIds]);

  // Перемещение объектов
  const handleDrag = useCallback((e) => {
    if (!isDraggingRef.current || !dragStartRef.current) return;
    
    const { object, x: startX, y: startY } = dragStartRef.current;
    const newX = e.clientX - startX;
    const newY = e.clientY - startY;
    
    // Привязка к сетке
    const gridSize = 20;
    const snappedX = Math.round(newX / gridSize) * gridSize;
    const snappedY = Math.round(newY / gridSize) * gridSize;
    
    // Обновляем позицию
    setObjects(prev => prev.map(obj => 
      obj.id === object.id 
        ? { ...obj, x: snappedX, y: snappedY }
        : obj
    ));
  }, []);

  // Завершение перетаскивания
  const stopDragging = useCallback(() => {
    isDraggingRef.current = false;
    dragStartRef.current = null;
  }, []);

  // Начало соединения
  const startConnection = useCallback((object) => {
    if (!selectedCableType) {
      alert('Сначала выберите тип кабеля!');
      return;
    }
    isConnectingRef.current = true;
    connectionStartRef.current = object;
  }, [selectedCableType]);

  // Временное отображение соединения
  const renderTempConnection = useCallback((e) => {
    if (!isConnectingRef.current || !connectionStartRef.current) return;
    
    const svg = svgRef.current;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const cursorPoint = point.matrixTransform(svg.getScreenCTM().inverse());
    
    const fromObject = connectionStartRef.current;
    const fromX = fromObject.x + 40;
    const fromY = fromObject.y + 40;
    
    // Рисуем временную линию
    if (tempLineRef.current) {
      tempLineRef.current.setAttribute('x1', fromX);
      tempLineRef.current.setAttribute('y1', fromY);
      tempLineRef.current.setAttribute('x2', cursorPoint.x);
      tempLineRef.current.setAttribute('y2', cursorPoint.y);
    }
  }, []);

  // Завершение соединения
  const finishConnection = useCallback((targetObject) => {
    if (!isConnectingRef.current || !connectionStartRef.current) return;
    
    const fromObject = connectionStartRef.current;
    if (fromObject.id === targetObject.id) return;
    
    const success = createConnection(
      fromObject.id, 
      targetObject.id, 
      selectedCableType
    );
    
    if (success) {
      console.log('Соединение создано');
    }
    
    // Сбрасываем состояние
    isConnectingRef.current = false;
    connectionStartRef.current = null;
    if (tempLineRef.current) {
      tempLineRef.current.setAttribute('x2', fromObject.x + 40);
      tempLineRef.current.setAttribute('y2', fromObject.y + 40);
    }
  }, [createConnection, selectedCableType]);

  // Начало выделения области
  const startSelection = useCallback((e) => {
    const svg = svgRef.current;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const startPoint = point.matrixTransform(svg.getScreenCTM().inverse());
    
    isSelectingRef.current = true;
    selectionStartRef.current = startPoint;
    
    // Создаем прямоугольник выделения
    if (selectionRectRef.current) {
      selectionRectRef.current.setAttribute('x', startPoint.x);
      selectionRectRef.current.setAttribute('y', startPoint.y);
      selectionRectRef.current.setAttribute('width', 0);
      selectionRectRef.current.setAttribute('height', 0);
      selectionRectRef.current.style.display = 'block';
    }
  }, []);

  // Обновление выделения области
  const updateSelection = useCallback((e) => {
    if (!isSelectingRef.current) return;
    
    const svg = svgRef.current;
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const currentPoint = point.matrixTransform(svg.getScreenCTM().inverse());
    
    const start = selectionStartRef.current;
    const x = Math.min(start.x, currentPoint.x);
    const y = Math.min(start.y, currentPoint.y);
    const width = Math.abs(currentPoint.x - start.x);
    const height = Math.abs(currentPoint.y - start.y);
    
    // Обновляем прямоугольник выделения
    if (selectionRectRef.current) {
      selectionRectRef.current.setAttribute('x', x);
      selectionRectRef.current.setAttribute('y', y);
      selectionRectRef.current.setAttribute('width', width);
      selectionRectRef.current.setAttribute('height', height);
    }
    
    // Выделяем объекты внутри области
    if (width > 5 && height > 5) {
      const selectedIds = objects
        .filter(obj => 
          obj.x >= x && 
          obj.x + 80 <= x + width && 
          obj.y >= y && 
          obj.y + 80 <= y + height
        )
        .map(obj => obj.id);
      
      setSelectedObjectIds(selectedIds);
    }
  }, [objects]);

  // Завершение выделения области
  const stopSelection = useCallback(() => {
    isSelectingRef.current = false;
    if (selectionRectRef.current) {
      selectionRectRef.current.style.display = 'none';
    }
  }, []);

  // Начало панорамирования
  const startPanning = useCallback((e) => {
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, y: e.clientY, pan: { ...pan } };
  }, [pan]);

  // Панорамирование
  const handlePanning = useCallback((e) => {
    if (!isPanningRef.current) return;
    
    const deltaX = e.clientX - panStartRef.current.x;
    const deltaY = e.clientY - panStartRef.current.y;
    
    setPan({
      x: panStartRef.current.pan.x + deltaX,
      y: panStartRef.current.pan.y + deltaY
    });
  }, []);

  // Завершение панорамирования
  const stopPanning = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // Обработка событий мыши на рабочей области
  const handleWorkspaceMouseDown = useCallback((e) => {
    // Левая кнопка мыши
    if (e.button === 0) {
      // Если клик не на объекте, начинаем выделение или панорамирование
      if (!e.target.closest('.network-object')) {
        if (e.ctrlKey || e.metaKey) {
          startPanning(e);
        } else {
          startSelection(e);
        }
      }
    }
    
    // Средняя кнопка мыши - всегда панорамирование
    if (e.button === 1) {
      e.preventDefault();
      startPanning(e);
    }
  }, [startPanning, startSelection]);

  const handleWorkspaceMouseMove = useCallback((e) => {
    if (isDraggingRef.current) handleDrag(e);
    if (isSelectingRef.current) updateSelection(e);
    if (isPanningRef.current) handlePanning(e);
    if (isConnectingRef.current) renderTempConnection(e);
  }, [handleDrag, updateSelection, handlePanning, renderTempConnection]);

  const handleWorkspaceMouseUp = useCallback((e) => {
    if (isDraggingRef.current) stopDragging();
    if (isSelectingRef.current) stopSelection();
    if (isPanningRef.current) stopPanning();
    
    // Если мы в режиме соединения и кликнули на объект, завершаем соединение
    if (isConnectingRef.current && e.target.closest('.network-object')) {
      const objectId = e.target.closest('.network-object').dataset.id;
      const targetObject = objects.find(obj => obj.id === objectId);
      if (targetObject) {
        finishConnection(targetObject);
      }
    }
  }, [stopDragging, stopSelection, stopPanning, finishConnection, objects]);

  // Обработка событий клавиатуры
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Удаление выделенных объектов
      if (e.key === 'Delete' && selectedObjectIds.length > 0) {
        if (window.confirm(`Удалить ${selectedObjectIds.length} объектов?`)) {
          selectedObjectIds.forEach(id => deleteObject(id));
        }
      }
      
      // Escape - снять выделение
      if (e.key === 'Escape') {
        setSelectedObjectIds([]);
      }
      
      // Ctrl+C - копирование
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const copied = objects.filter(obj => selectedObjectIds.includes(obj.id));
        copiedObjectsRef.current = copied;
        console.log('Скопировано объектов:', copied.length);
      }
      
      // Ctrl+V - вставка
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        const offset = 30;
        copiedObjectsRef.current.forEach((obj, i) => {
          createObject(
            obj.type, 
            obj.x + (i + 1) * offset, 
            obj.y + (i + 1) * offset,
            obj.name,
            obj.number
          );
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedObjectIds, deleteObject, createObject, objects]);

  // Отрисовка соединений
  const renderConnection = (connection) => {
    const fromObj = objects.find(obj => obj.id === connection.from);
    const toObj = objects.find(obj => obj.id === connection.to);
    
    if (!fromObj || !toObj) return null;
    
    const fromX = fromObj.x + 40;
    const fromY = fromObj.y + 40;
    const toX = toObj.x + 40;
    const toY = toObj.y + 40;
    
    // Кривая Безье для более естественного вида
    const dx = toX - fromX;
    const controlX1 = fromX + dx * 0.5;
    const controlY1 = fromY;
    const controlX2 = fromX + dx * 0.5;
    const controlY2 = toY;
    
    const pathData = `M ${fromX} ${fromY} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${toX} ${toY}`;
    
    return (
      <path
        key={connection.id}
        d={pathData}
        stroke={CABLE_TYPES[connection.type].color}
        strokeWidth="3"
        fill="none"
        markerEnd="url(#arrowhead)"
        className="connection"
      />
    );
  };

  // Отрисовка объектов
  const renderObject = (object) => {
    const isSelected = selectedObjectIds.includes(object.id);
    
    return (
      <g
        key={object.id}
        className={`network-object ${isSelected ? 'selected' : ''}`}
        data-id={object.id}
        transform={`translate(${object.x}, ${object.y})`}
        onMouseDown={(e) => startDragging(e, object)}
        onClick={(e) => {
          e.stopPropagation();
          selectObject(object.id, e.shiftKey);
        }}
        style={{ cursor: 'move' }}
      >
        {/* Прямоугольник объекта */}
        <rect
          width="80"
          height="80"
          rx="8"
          fill="white"
          stroke={isSelected ? '#ff6b6b' : '#007bff'}
          strokeWidth={isSelected ? '3' : '2'}
          style={{ transition: 'all 0.15s ease' }}
        />
        
        {/* Иконка и текст */}
        <text
          x="40"
          y="35"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="24"
        >
          {OBJECT_TYPES[object.type].icon}
        </text>
        <text
          x="40"
          y="60"
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="10"
          fontWeight="500"
        >
          {object.name} №{object.number}
        </text>
        
        {/* Точка соединения */}
        <circle
          cx="40"
          cy="40"
          r="6"
          fill="#20c997"
          stroke="white"
          strokeWidth="2"
          style={{ opacity: 0, transition: 'opacity 0.2s' }}
          className="connection-point"
          onMouseDown={(e) => {
            e.stopPropagation();
            startConnection(object);
          }}
        />
      </g>
    );
  };

  // Экспорт в JSON
  const exportToJSON = () => {
    const exportData = {
      version: "1.0",
      createdAt: new Date().toISOString(),
      objectCounters,
      objects,
      connections
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
    
    alert('Схема успешно экспортирована!');
  };

  // Импорт из JSON
  const importFromJSON = (file) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        if (data.objects) {
          setObjects(data.objects);
        }
        
        if (data.connections) {
          setConnections(data.connections);
        }
        
        if (data.objectCounters) {
          setObjectCounters(data.objectCounters);
        }
        
        alert(`Схема импортирована! Объектов: ${data.objects?.length || 0}, Соединений: ${data.connections?.length || 0}`);
      } catch (error) {
        alert('Ошибка при импорте файла: ' + error.message);
      }
    };
    
    reader.readAsText(file);
  };

  // Очистка рабочей области
  const clearWorkspace = () => {
    if (window.confirm('Вы уверены, что хотите очистить всё поле?')) {
      setObjects([]);
      setConnections([]);
      setSelectedObjectIds([]);
      setObjectCounters({
        router: 0, switch: 0, server: 0, pc: 0, firewall: 0
      });
    }
  };

  // Изменение масштаба
  const zoomIn = () => setScale(prev => Math.min(3, prev + 0.1));
  const zoomOut = () => setScale(prev => Math.max(0.3, prev - 0.1));
  const zoomReset = () => setScale(1);

  return (
    <div className="container">
      {/* Панель доступных объектов */}
      <div className="objects-panel">
        <h3>Доступные объекты</h3>
        {Object.entries(OBJECT_TYPES).map(([type, { label, icon, color }]) => (
          <div
            key={type}
            className="object-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', type);
            }}
          >
            <div className="object-icon" style={{ background: color }}>
              {icon}
            </div>
            <span>{label}</span>
          </div>
        ))}
        
        <h3 style={{ marginTop: '20px' }}>Типы кабелей</h3>
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
          onMouseMove={handleWorkspaceMouseMove}
          onMouseUp={handleWorkspaceMouseUp}
          onMouseLeave={stopSelection}
        >
          <defs>
            {/* Маркер для стрелок */}
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
          
          {/* Сетка */}
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
          
          {/* Группа для трансформаций (масштаб и панорамирование) */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {/* Соединения */}
            {connections.map(renderConnection)}
            
            {/* Временное соединение */}
            <line
              ref={tempLineRef}
              stroke={CABLE_TYPES[selectedCableType]?.color || '#28a745'}
              strokeWidth="3"
              strokeDasharray="5,5"
              markerEnd="url(#arrowhead)"
              style={{ display: isConnectingRef.current ? 'block' : 'none' }}
            />
            
            {/* Объекты */}
            {objects.map(renderObject)}
          </g>
          
          {/* Прямоугольник выделения */}
          <rect
            ref={selectionRectRef}
            className="selection-rect"
            style={{ display: 'none' }}
            fill="rgba(0, 123, 255, 0.1)"
            stroke="#007bff"
            strokeWidth="1"
            strokeDasharray="5,5"
          />
        </svg>
        
        {/* Элементы управления масштабом */}
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={zoomOut} title="Уменьшить">
            -
          </button>
          <div className="zoom-level">
            {Math.round(scale * 100)}%
          </div>
          <button className="zoom-btn" onClick={zoomIn} title="Увеличить">
            +
          </button>
          <button className="zoom-btn" onClick={zoomReset} title="Сбросить масштаб">
            100%
          </button>
        </div>
      </div>

      {/* Панель размещенных объектов */}
      <div className="placed-objects">
        <h3>Размещенные объекты ({objects.length})</h3>
        <div id="placedObjectsList">
          {objects.map(obj => (
            <div key={obj.id} className="placed-object-item">
              <span className="icon">{OBJECT_TYPES[obj.type].icon}</span>
              <span>{obj.name} №{obj.number}</span>
            </div>
          ))}
        </div>
        
        <h3 style={{ marginTop: '20px' }}>Соединения ({connections.length})</h3>
        <div id="connectionsList">
          {connections.map(conn => {
            const fromObj = objects.find(obj => obj.id === conn.from);
            const toObj = objects.find(obj => obj.id === conn.to);
            
            return fromObj && toObj ? (
              <div key={conn.id} className="connection-item">
                <div className="cable-icon" style={{ background: CABLE_TYPES[conn.type].color }}>
                  {CABLE_TYPES[conn.type].icon}
                </div>
                <span>
                  {CABLE_TYPES[conn.type].label}: {fromObj.name} → {toObj.name}
                </span>
              </div>
            ) : null;
          })}
        </div>
      </div>

      {/* Панель управления */}
      <div className="control-panel">
        <h3>Управление</h3>
        <button className="control-btn" onClick={exportToJSON}>
          💾 Экспорт в JSON
        </button>
        <div className="import-group">
          <input
            type="file"
            id="importFile"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files[0]) importFromJSON(e.target.files[0]);
            }}
          />
          <button 
            className="control-btn" 
            onClick={() => document.getElementById('importFile').click()}
          >
            📁 Импорт из JSON
          </button>
        </div>
        <button className="control-btn clear" onClick={clearWorkspace}>
          🗑️ Очистить поле
        </button>
        <div className="current-cable">
          <span>Текущий кабель: </span>
          <span>{CABLE_TYPES[selectedCableType]?.label || 'Не выбран'}</span>
        </div>
      </div>
    </div>
  );
};

export default NetworkDiagram;