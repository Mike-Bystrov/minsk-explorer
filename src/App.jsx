import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { supabase } from "./supabaseClient";

// 1. Используем только CDN ссылки для иконок (100% работа на Vercel)
const ICON_URL = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
const SHADOW_URL =
  "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: ICON_URL,
  shadowUrl: SHADOW_URL,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const userIcon = L.divIcon({
  className: "user-location-icon",
  html: '<div style="background-color: #3b82f6; width: 18px; height: 18px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>',
  iconSize: [20, 20],
});

const MINSK_CENTER = [53.9006, 27.559];
const MINSK_BOUNDS = [
  [53.82, 27.38],
  [53.98, 27.75],
];

const dataCache = {};

function RecenterAutomatically({ userPos }) {
  const map = useMap();
  useEffect(() => {
    if (userPos) map.setView(userPos, 15);
  }, [userPos, map]);
  return null;
}

function App() {
  const [user, setUser] = useState(null);
  const [visitedIds, setVisitedIds] = useState([]);
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("cafe");
  const [userPos, setUserPos] = useState(null);

  // Авторизация
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => setUser(session?.user ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null),
    );
    return () => subscription.unsubscribe();
  }, []);

  // Геолокация
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      (err) => console.log("Геолокация недоступна, используем ручной режим"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Загрузка данных (с новым зеркалом и исправленным CORS)
  const fetchPlaces = async (type) => {
    if (dataCache[type]) {
      setPlaces(dataCache[type]);
      return;
    }
    setLoading(true);

    // Используем зеркало lz4 и добавляем таймаут в сам запрос
    const query = `[out:json][timeout:25];
      node["amenity"="${type}"](53.82, 27.38, 53.98, 27.75);
      out;`;

    // Попробуем альтернативное зеркало, если основное дает 406
    const url = `https://lz4.overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Сетевая ошибка");
      const data = await response.json();
      const elements = data.elements || [];
      dataCache[type] = elements;
      setPlaces(elements);
    } catch (error) {
      console.error("Ошибка API:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaces(category);
  }, [category]);

  // Посещения
  useEffect(() => {
    const fetchVisited = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("visited_places")
        .select("place_id")
        .eq("user_id", user.id);
      if (data) setVisitedIds(data.map((i) => i.place_id));
    };
    fetchVisited();
  }, [user]);

  const toggleVisit = async (placeId) => {
    if (!user) return alert("Войдите!");
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

  const getDistance = (pos1, pos2) => {
    if (!pos1 || !pos2) return null;
    return L.latLng(pos1).distanceTo(L.latLng(pos2));
  };

  const getIcon = (placeId) => {
    const isVisited = visitedIds.includes(placeId);
    return L.icon({
      iconUrl: ICON_URL,
      shadowUrl: SHADOW_URL,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      className: isVisited ? "visited-marker" : "",
    });
  };

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
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
            <button
              onClick={() => supabase.auth.signInAnonymously()}
              style={authBtnStyle}
            >
              Войти
            </button>
          ) : (
            <button
              onClick={() => supabase.auth.signOut()}
              style={authBtnStyle}
            >
              Выйти
            </button>
          )}
        </div>

        {user && (
          <>
            <div style={{ display: "flex", gap: "5px", marginBottom: "10px" }}>
              {["cafe", "restaurant", "cinema"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  style={btnStyle(category === cat)}
                >
                  {cat === "cafe" ? "☕" : cat === "restaurant" ? "🍲" : "🎬"}
                </button>
              ))}
            </div>
            <div style={{ fontSize: "12px", color: "#666" }}>
              {loading ? "Загрузка..." : `Посещено: ${visitedIds.length}`}
            </div>
          </>
        )}
      </div>

      <MapContainer
        center={MINSK_CENTER}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        <RecenterAutomatically userPos={userPos} />

        {userPos && (
          <Marker position={userPos} icon={userIcon}>
            <Popup>Ты здесь!</Popup>
          </Marker>
        )}

        <MarkerClusterGroup chunkedLoading>
          {places.map((place) => {
            const dist = getDistance(userPos, [place.lat, place.lon]);
            return (
              <Marker
                key={place.id}
                position={[place.lat, place.lon]}
                icon={getIcon(place.id)}
              >
                <Popup>
                  <strong>{place.tags.name || "Без названия"}</strong>
                  <br />
                  <p>
                    Дистанция:{" "}
                    {dist
                      ? dist < 1000
                        ? `${Math.round(dist)}м`
                        : `${(dist / 1000).toFixed(1)}км`
                      : "Определяем GPS..."}
                  </p>
                  <button
                    onClick={() => toggleVisit(place.id)}
                    style={{ marginTop: "5px", cursor: "pointer" }}
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
      </MapContainer>
    </div>
  );
}

const panelStyle = {
  position: "absolute",
  top: 15,
  left: 60,
  zIndex: 1000,
  background: "rgba(255,255,255,0.9)",
  padding: "15px",
  borderRadius: "12px",
  boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
  minWidth: "200px",
};
const btnStyle = (active) => ({
  padding: "8px 12px",
  cursor: "pointer",
  border: "none",
  borderRadius: "6px",
  background: active ? "#007bff" : "#eee",
  color: active ? "white" : "black",
});
const authBtnStyle = {
  padding: "4px 8px",
  fontSize: "11px",
  cursor: "pointer",
  borderRadius: "4px",
  border: "1px solid #ccc",
};

export default App;
