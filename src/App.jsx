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

  // Правильные константы для объектов
  const OBJECT_TYPES = {
    server: { label: 'Сервер', icon: '🖥️', color: '#e8f5e8' },
    firewall: { label: 'Фаервол', icon: '🔥', color: '#ffebee' },
    loadbalancer: { label: 'Балансировщик', icon: '⚖️', color: '#fff3cd' },
    service: { label: 'Сервис', icon: '⚙️', color: '#cfe2ff' },
    container: { label: 'Контейнер', icon: '📦', color: '#d1e7dd' },
    network: { label: 'Сеть', icon: '🌐', color: '#f8d7da' }
  };

  // Правильные константы для кабелей
  const CABLE_TYPES = {
    logical: { label: 'Логическая связь', icon: '➡️', color: '#6c757d' }
  };

  // Рефы
  const svgRef = useRef();
  const isConnectingRef = useRef(false);
  const connectionStartRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ startX: 0, startY: 0, origPan: { x: 0, y: 0 } });

  // Создание объекта
  const createObject = useCallback((type, x, y) => {
    const id = 'obj_' + Date.now();
    const newObject = {
      id,
      type,
      x,
      y,
      name: OBJECT_TYPES[type].label,
      number: objects.filter(obj => obj.type === type).length + 1
    };
    setObjects(prev => [...prev, newObject]);
  }, [objects, OBJECT_TYPES]);

  // Создание соединения
  const createConnection = useCallback((fromId, toId, type) => {
    const id = 'conn_' + Date.now();
    const newConnection = { id, from: fromId, to: toId, type };
    
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

  // Обработчики событий
  const handleWorkspaceMouseDown = (e) => {
    // Middle button (wheel) starts panning
    if (e.button === 1) {
      // start panning
      isPanningRef.current = true;
      panStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origPan: { ...pan }
      };
      // change cursor and prevent default browser autoscroll
      if (svgRef.current) svgRef.current.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    // Left click on empty space clears selection
    if (e.button === 0 && !e.target.closest('.network-object')) {
      setSelectedObjectIds([]);
    }
  };

  const handleObjectMouseDown = (e, object) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    // Конвертируем экранные координаты в мировые с учётом панорамирования и масштаба
    const rect = svgRef.current.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - pan.x) / scale;
    const worldY = (e.clientY - rect.top - pan.y) / scale;

    dragStartRef.current = {
      offsetX: worldX - object.x,
      offsetY: worldY - object.y,
      object
    };

    // Если зажат Shift — не менять текущее выделение здесь (обработает onClick)
    if (!e.shiftKey) {
      if (!selectedObjectIds.includes(object.id)) {
        setSelectedObjectIds([object.id]);
      }
    }
  };

  const handleMouseMove = (e) => {
    // Перемещение выбранного объекта
    if (isDraggingRef.current && dragStartRef.current) {
      const { object, offsetX, offsetY } = dragStartRef.current;
      const rect = svgRef.current.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - pan.x) / scale;
      const worldY = (e.clientY - rect.top - pan.y) / scale;

      const newX = worldX - offsetX;
      const newY = worldY - offsetY;

      setObjects(prev => prev.map(obj => 
        obj.id === object.id 
          ? { ...obj, x: newX, y: newY }
          : obj
      ));
      return;
    }

    // Параллельно: панорамирование по средней кнопке
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

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    dragStartRef.current = null;
    if (isPanningRef.current) {
      isPanningRef.current = false;
      if (svgRef.current) svgRef.current.style.cursor = '';
    }
  };

  // Преобразование экранных координат в мировые (с учётом пана и масштаба)
  const screenToWorld = (clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / scale,
      y: (clientY - rect.top - pan.y) / scale
    };
  };

  // Обработка колеса мыши: Ctrl+wheel = зум, иначе панорамирование
  const handleWheel = (e) => {
    if (!svgRef.current) return;
    e.preventDefault();

    const rect = svgRef.current.getBoundingClientRect();

    if (e.ctrlKey) {
      // Zoom относительно положения курсора
      const worldBefore = {
        x: (e.clientX - rect.left - pan.x) / scale,
        y: (e.clientY - rect.top - pan.y) / scale
      };
      const zoomFactor = Math.exp(-e.deltaY * 0.0015); // плавный экспоненциальный зум
      const newScale = Math.max(0.2, Math.min(3, scale * zoomFactor));

      const newPanX = (e.clientX - rect.left) - worldBefore.x * newScale;
      const newPanY = (e.clientY - rect.top) - worldBefore.y * newScale;

      setScale(newScale);
      setPan({ x: newPanX, y: newPanY });
    } else {
      // Панорамирование: колесо — вертикальная прокрутка, Shift+wheel — горизонтальная
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
      alert('Сначала выберите тип подключения!');
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
    
    if (e.shiftKey) {
      setSelectedObjectIds(prev => 
        prev.includes(object.id) 
          ? prev.filter(id => id !== object.id)
          : [...prev, object.id]
      );
    } else {
      setSelectedObjectIds([object.id]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain');
    const rect = svgRef.current.getBoundingClientRect();
    // Преобразуем в мировые координаты с учётом пана и зума
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
      setObjects(prev => prev.filter(obj => !selectedObjectIds.includes(obj.id)));
      setConnections(prev => prev.filter(conn => 
        !selectedObjectIds.includes(conn.from) && !selectedObjectIds.includes(conn.to)
      ));
      setSelectedObjectIds([]);
    }
  };

  const clearWorkspace = () => {
    if (window.confirm('Очистить всё поле?')) {
      setObjects([]);
      setConnections([]);
      setSelectedObjectIds([]);
      setObjectCounters({
        server: 0, firewall: 0, loadbalancer: 0, service: 0, container: 0, network: 0
      });
    }
  };

  const exportToJSON = () => {
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
        setObjects(data.objects || []);
        setConnections(data.connections || []);
        setObjectCounters(data.objectCounters || {
          server: 0, firewall: 0, loadbalancer: 0, service: 0, container: 0, network: 0
        });
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
        <circle
          cx="40"
          cy="40"
          r="6"
          fill="#20c997"
          stroke="white"
          strokeWidth="2"
          style={{ opacity: 0 }}
          className="connection-point"
          onMouseDown={(e) => {
            e.stopPropagation();
            startConnection(object);
          }}
        />
      </g>
    );
  };

  // Эффекты
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete') {
        deleteSelectedObjects();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [selectedObjectIds]);

  // Устанавливаем нативный wheel-listener с passive: false на SVG, чтобы
  // при Ctrl+wheel предотвратить масштаб страницы и позволить масштабировать только доску
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const nativeWheelHandler = (e) => {
      // Если зажат Ctrl — отменяем дефолтное поведение (масштаб страницы)
      if (e.ctrlKey) {
        e.preventDefault();
      }
      // также можно предотвратить при MetaKey на macOS
      if (e.metaKey) {
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

      {/* Панель размещенных объектов */}
      <div className="placed-objects">
        <h3>Размещенные объекты ({objects.length})</h3>
        <div>
          {objects.map(obj => (
            <div key={obj.id} className="placed-object-item">
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