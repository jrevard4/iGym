'use client';

import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import Link from 'next/link';

// Emoji div-icon instead of Leaflet's default marker image — sidesteps the
// classic "broken marker icon" bundler issue (Leaflet's default icon paths
// don't resolve under webpack/Next without extra config).
const pinIcon = L.divIcon({
  html: '<div style="font-size:28px;line-height:1;transform:translateY(-4px)">📍</div>',
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

export default function GymMap({ gyms, userLoc }) {
  const located = gyms.filter((g) => g.lat && g.lon);
  const center = located.length > 0
    ? [located[0].lat, located[0].lon]
    : [userLoc.latitude, userLoc.longitude];

  return (
    <div className="h-[520px] rounded-2xl overflow-hidden border border-gray-200">
      <MapContainer center={center} zoom={11} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {located.map((gym) => (
          <Marker key={gym.id} position={[gym.lat, gym.lon]} icon={pinIcon}>
            <Popup>
              <div className="text-sm">
                <div className="font-bold mb-1">{gym.gymName}</div>
                <div className="text-gray-500 mb-2">{gym.location}</div>
                <Link href={`/gyms/${gym.id}`} className="text-brand-text font-semibold hover:underline">
                  View gym →
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
