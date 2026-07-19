import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { supabase } from "./supabaseClient";

// Иконки (CDN)
const ICON_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png";
const SHADOW_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: ICON_URL,
  shadowUrl: SHADOW_URL,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const MINSK_CENTER = [53.9006, 27.559];

function RecenterAutomatically({ userPos }) {
  const map = useMap();
  useEffect(() => {
    if (userPos) map.setView(userPos, 15);
  }, [userPos]);
  return null;
}

function App() {
  const [user, setUser] = useState(null);
  const [visitedIds, setVisitedIds] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("cafe");
  const [userPos, setUserPos] = useState(null);
  const [status, setStatus] = useState("Инициализация...");

  // Тестовая точка, которая будет ВСЕГДА (Октябрьская площадь)
  const testPlace = {
    id: 999999,
    lat: 53.9035,
    lon: 27.5615,
    tags: { name: "ТЕСТОВАЯ ТОЧКА (Октябрьская)" },
  };

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => setUser(session?.user ?? null));

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
        (err) => setStatus("GPS ошибка: " + err.message),
      );
    }
  }, []);

  const fetchPlaces = async (type) => {
    setLoading(true);
    setStatus("Загрузка " + type + "...");

    const query = `[out:json][timeout:25];node["amenity"="${type}"](53.82,27.38,53.98,27.75);out;`;
    const url = `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          // Не добавляем лишних заголовков, которые могут вызвать CORS
        },
      });
      if (!response.ok) throw new Error("Сервер ответил: " + response.status);
      const data = await response.json();
      setPlaces(data.elements || []);
      setStatus("ОК: найдено " + (data.elements?.length || 0));
    } catch (error) {
      console.error(error);
      setStatus("Ошибка API: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaces(category);
  }, [category]);

  useEffect(() => {
    const fetchVisited = async () => {
      if (!user) return;
      const { data } = await supabase.from("visited_places").select("place_id");
      if (data) setVisitedIds(data.map((i) => i.place_id));
    };
    fetchVisited();
  }, [user]);

  const toggleVisit = async (placeId) => {
    if (!user) {
      alert("Сначала нажмите Войти");
      return;
    }
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

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      {/* ПАНЕЛЬ СТАТУСА */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: 10,
          zIndex: 2000,
          background: "rgba(0,0,0,0.7)",
          color: "white",
          padding: "8px",
          fontSize: "12px",
          borderRadius: "5px",
        }}
      >
        Статус: {status}
      </div>

      <div style={panelStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "10px",
          }}
        >
          <b>Minsk Explorer</b>
          {!user ? (
            <button onClick={() => supabase.auth.signInAnonymously()}>
              Войти
            </button>
          ) : (
            <button onClick={() => supabase.auth.signOut()}>Выйти</button>
          )}
        </div>
        {user && (
          <div
            style={{
              marginTop: "10px",
              display: "flex",
              gap: "10px",
              alignItems: "center",
            }}
          >
            <button onClick={() => setCategory("cafe")}>☕ Кафе</button>
            <button onClick={() => setCategory("restaurant")}>🍲 Еда</button>
            <span style={{ fontSize: "12px" }}>🏆 {visitedIds.length}</span>
          </div>
        )}
      </div>

      <MapContainer
        center={MINSK_CENTER}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <RecenterAutomatically userPos={userPos} />

        {/* МАРКЕР ИГРОКА */}
        {userPos && (
          <Marker
            position={userPos}
            icon={L.divIcon({
              className: "",
              html: '<div style="background: #3b82f6; width: 15px; height: 15px; border-radius: 50%; border: 2px solid white;"></div>',
            })}
          >
            <Popup>Ты здесь!</Popup>
          </Marker>
        )}

        {/* ТЕСТОВАЯ ТОЧКА (ВСЕГДА ЕСТЬ) */}
        <Marker position={[testPlace.lat, testPlace.lon]} icon={DefaultIcon}>
          <Popup>
            {testPlace.tags.name}
            <br />
            <button onClick={() => toggleVisit(testPlace.id)}>
              {visitedIds.includes(testPlace.id) ? "✅ Посещено" : "Отметить"}
            </button>
          </Popup>
        </Marker>

        {/* ОБЪЕКТЫ ИЗ API */}
        <MarkerClusterGroup>
          {places.map((place) => (
            <Marker
              key={place.id}
              position={[place.lat, place.lon]}
              icon={L.icon({
                iconUrl: ICON_URL,
                shadowUrl: SHADOW_URL,
                iconSize: [25, 41],
                className: visitedIds.includes(place.id)
                  ? "visited-marker"
                  : "",
              })}
            >
              <Popup>
                {place.tags.name || "Без названия"}
                <br />
                <button onClick={() => toggleVisit(place.id)}>
                  {visitedIds.includes(place.id)
                    ? "❌ Удалить"
                    : "✅ Я ТУТ БЫЛ"}
                </button>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}

const panelStyle = {
  position: "absolute",
  top: 10,
  left: 10,
  zIndex: 1000,
  background: "white",
  padding: "12px",
  borderRadius: "10px",
  boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
};

export default App;
