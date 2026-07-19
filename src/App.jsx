import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
// 1. ВАЖНО: Добавили импорт клиента
import { supabase } from "./supabaseClient";

// Фикс иконок
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const userIcon = L.divIcon({
  className: "user-location-icon",
  html: '<div style="background-color: #3b82f6; width: 15px; height: 15px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>',
  iconSize: [20, 20],
});
const MINSK_CENTER = [53.9006, 27.559];
const MINSK_BOUNDS = [
  [53.82, 27.38],
  [53.98, 27.75],
];

const dataCache = {};

function RecenterAutomatically({ userPos }) {
  const map = useMap(); // Доступ к объекту карты
  useEffect(() => {
    if (userPos) {
      map.setView(userPos, 15); // Прыгнуть к игроку при первом получении координат
    }
  }, [userPos, map]);
  return null;
}

function App() {
  // 2. Объявляем все состояния (States)
  const [user, setUser] = useState(null);
  const [visitedIds, setVisitedIds] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("cafe");

  // --- ЛОГИКА АВТОРИЗАЦИИ ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) console.error("Ошибка входа:", error.message);
    else setUser(data.user);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setVisitedIds([]);
  };

  // --- ЛОГИКА ПОЛУЧЕНИЯ ДАННЫХ ИЗ OSM ---
  const fetchPlaces = async (type) => {
    if (dataCache[type]) {
      setPlaces(dataCache[type]);
      return;
    }
    setLoading(true);
    const query = `[out:json];
      node["amenity"="${type}"](53.82, 27.38, 53.98, 27.75);
      out;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(url);
      const data = await response.json();
      const elements = data.elements || [];
      dataCache[type] = elements;
      setPlaces(elements);
    } catch (error) {
      console.error("Ошибка:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaces(category);
  }, [category]);

  // --- ЛОГИКА ПОСЕЩЕНИЙ (SUPABASE) ---
  const fetchVisitedPlaces = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("visited_places")
      .select("place_id")
      .eq("user_id", user.id);
    if (data) setVisitedIds(data.map((item) => item.place_id));
  };

  useEffect(() => {
    fetchVisitedPlaces();
  }, [user]);

  const toggleVisit = async (placeId) => {
    if (!user) return alert("Войдите в систему!");

    if (visitedIds.includes(placeId)) {
      await supabase
        .from("visited_places")
        .delete()
        .eq("place_id", placeId)
        .eq("user_id", user.id);
      setVisitedIds((prev) => prev.filter((id) => id !== placeId));
    } else {
      await supabase
        .from("visited_places")
        .insert([{ user_id: user.id, place_id: placeId, category }]);
      setVisitedIds((prev) => [...prev, placeId]);
    }
  };
  // ... внутри App()
  const [userPos, setUserPos] = useState(null); // Координаты игрока

  // Включаем слежку за геолокацией
  useEffect(() => {
    if (!navigator.geolocation) {
      alert("Геолокация не поддерживается вашим браузером");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        console.log("Координаты получены:", latitude, longitude);
        setUserPos([latitude, longitude]);
      },
      (error) => {
        // Выводим конкретную ошибку
        console.error("Ошибка геолокации:", error);
        if (error.code === 1)
          alert("Пожалуйста, разрешите доступ к местоположению в браузере!");
        if (error.code === 3) console.log("Таймаут геолокации...");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000, // увеличим таймаут до 10 сек
        maximumAge: 0,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Функция для расчета расстояния (в метрах) между двумя точками
  const getDistance = (pos1, pos2) => {
    if (!pos1 || !pos2) return Infinity;
    const p1 = L.latLng(pos1[0], pos1[1]);
    const p2 = L.latLng(pos2[0], pos2[1]);
    return p1.distanceTo(p2); // Возвращает расстояние в метрах
  };
  // Функция для смены цвета маркера
  const getIcon = (placeId) => {
    const isVisited = visitedIds.includes(placeId);
    return L.icon({
      iconUrl: markerIcon,
      shadowUrl: markerShadow,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      className: isVisited ? "visited-marker" : "",
    });
  };

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      {/* UI ПАНЕЛЬ */}
      <div style={panelStyle}>
        <div
          style={{
            marginBottom: "10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: "bold" }}>Minsk Explorer</span>
          {!user ? (
            <button onClick={handleLogin} style={authBtnStyle}>
              Войти
            </button>
          ) : (
            <button onClick={handleLogout} style={authBtnStyle}>
              Выйти
            </button>
          )}
        </div>

        {user ? (
          <>
            <div style={{ display: "flex", gap: "5px", marginBottom: "10px" }}>
              <button
                onClick={() => setCategory("cafe")}
                style={btnStyle(category === "cafe")}
              >
                ☕
              </button>
              <button
                onClick={() => setCategory("restaurant")}
                style={btnStyle(category === "restaurant")}
              >
                🍲
              </button>
              <button
                onClick={() => setCategory("cinema")}
                style={btnStyle(category === "cinema")}
              >
                🎬
              </button>
            </div>
            <div style={{ fontSize: "12px", color: "#666" }}>
              {loading ? "Загрузка..." : `Посещено: ${visitedIds.length} мест`}
            </div>
          </>
        ) : (
          <div style={{ fontSize: "12px", color: "#d9534f" }}>
            Войдите для сохранения прогресса
          </div>
        )}
      </div>
      {/* КАРТА */}
      <MapContainer
        center={MINSK_CENTER}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        maxBounds={MINSK_BOUNDS}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* ТВОЯ ПОЗИЦИЯ */}
        {userPos && (
          <Marker position={userPos} icon={userIcon}>
            <Popup>Ты здесь!</Popup>
          </Marker>
        )}
        <MarkerClusterGroup>
          {places.map((place) => {
            // Считаем расстояние от игрока до этой точки
            const distance = getDistance(userPos, [place.lat, place.lon]);
            const isClose = distance < 100; // 100 метров - "зона досягаемости"

            return (
              <Marker
                key={place.id}
                position={[place.lat, place.lon]}
                icon={getIcon(place.id)}
              >
                <Popup>
                  <strong>{place.tags.name || "Без названия"}</strong>
                  <br />
                  {isClose && !visitedIds.includes(place.id) && (
                    <p style={{ color: "green", fontWeight: "bold" }}>
                      ✨ Ты рядом! Можно отмечать.
                    </p>
                  )}
                  <p>
                    Расстояние:{" "}
                    {distance < 1000
                      ? `${Math.round(distance)}м`
                      : `${(distance / 1000).toFixed(1)}км`}
                  </p>

                  <button
                    onClick={() => toggleVisit(place.id)}
                    style={{ marginTop: "10px" }}
                  >
                    {visitedIds.includes(place.id)
                      ? "❌ Удалить"
                      : "✅ Я ТУТ БЫЛ"}
                  </button>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
        <RecenterAutomatically userPos={userPos} /> {/* Оживит камеру */}
        {userPos && (
          <Marker position={userPos} icon={userIcon}>
            <Popup>Ты здесь!</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

// Стили
const panelStyle = {
  position: "absolute",
  top: 15,
  left: 60,
  zIndex: 1000,
  background: "rgba(255, 255, 255, 0.9)",
  padding: "15px",
  borderRadius: "12px",
  boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
  backdropFilter: "blur(5px)",
  minWidth: "200px",
};

const btnStyle = (active) => ({
  padding: "8px 12px",
  cursor: "pointer",
  border: "none",
  borderRadius: "6px",
  background: active ? "#007bff" : "#eee",
  color: active ? "white" : "black",
  transition: "all 0.2s",
});

const authBtnStyle = {
  padding: "4px 8px",
  fontSize: "11px",
  cursor: "pointer",
  borderRadius: "4px",
  border: "1px solid #ccc",
  background: "#fff",
};

export default App;
