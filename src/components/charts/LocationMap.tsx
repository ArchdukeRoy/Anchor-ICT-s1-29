import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const LOCATION_COORDS: Record<string, [number, number]> = {
  'Khartoum, Al Khartum, Sudan':             [15.5007,  32.5599],
  'Khartoum North, Al Khartum, Sudan':       [15.6333,  32.6333],
  'Omdurman, Al Khartum, Sudan':             [15.6442,  32.4800],
  'Wadi Seidna, Al Khartum, Sudan':          [15.9000,  32.5000],
  'Wadi Sayyidna, Al Khartum, Sudan':        [15.9000,  32.5000],
  'Al-Manshiya, Al Khartum, Sudan':          [15.5500,  32.5000],
  'Kabbashi, Al Khartum, Sudan':             [15.6000,  32.5000],
  'Darfur, Gharb Darfur, Sudan':             [12.8000,  23.0000],
  'El Fasher, Shamal Darfur, Sudan':         [13.6279,  25.3497],
  'El-Fasher, Shamal Darfur, Sudan':         [13.6279,  25.3497],
  'Fasher, Kassala, Sudan':                  [13.6279,  25.3497],
  'Fashir, Kassala, Sudan':                  [13.6279,  25.3497],
  'Dabanga, Shamal Darfur, Sudan':           [14.6500,  24.4500],
  'Tawila, Shamal Darfur, Sudan':            [14.6000,  25.7000],
  'Kebkabiya, Shamal Darfur, Sudan':         [13.9833,  24.0167],
  'Jebel Amer, Shamal Darfur, Sudan':        [13.7000,  24.2000],
  'Kutum, Shamal Darfur, Sudan':             [14.2000,  24.6700],
  'El Geneina, Gharb Darfur, Sudan':         [13.4500,  22.4333],
  'Geneina, Gharb Darfur, Sudan':            [13.4500,  22.4333],
  'Al Geneina, Gharb Darfur, Sudan':         [13.4500,  22.4333],
  'El-Geneina, Gharb Darfur, Sudan':         [13.4500,  22.4333],
  'Misterei, Gharb Darfur, Sudan':           [14.5500,  25.3000],
  'Zalingei, Gharb Darfur, Sudan':           [12.9167,  23.4667],
  'Nyala, Janub Darfur, Sudan':              [12.0500,  24.8833],
  'Ed Daein, Janub Darfur, Sudan':           [11.4667,  26.1333],
  'Um Dafuq, Janub Darfur, Sudan':           [10.4000,  24.9000],
  'Rizeigat, Janub Darfur, Sudan':           [10.5000,  25.5000],
  'Kubum, Janub Darfur, Sudan':              [11.2000,  24.5000],
  'Kordofan, Shamal Kurdufan, Sudan':        [13.5000,  29.5000],
  'El Obeid, Shamal Kurdufan, Sudan':        [13.1825,  30.2167],
  'Barah, Shamal Kurdufan, Sudan':           [13.7000,  30.5000],
  'Kadada, Shamal Kurdufan, Sudan':          [13.3000,  30.0000],
  'Kadugli, Janub Kurdufan, Sudan':          [11.0097,  29.7183],
  'Nuba Mountains, Janub Kurdufan, Sudan':   [11.0000,  30.0000],
  'Abyei, Janub Kurdufan, Sudan':            [ 9.5950,  28.4333],
  'Babanusa, Janub Kurdufan, Sudan':         [11.3321,  27.8122],
  'Muglad, Janub Kurdufan, Sudan':           [11.0333,  27.7333],
  'Kauda, Janub Kurdufan, Sudan':            [11.1000,  30.0000],
  'Rakuba, Janub Kurdufan, Sudan':           [11.5000,  29.0000],
  'Al-Fula, An Nil al Abya?, Sudan':         [11.7200,  28.3800],
  'El Fula, An Nil al Abya?, Sudan':         [11.7200,  28.3800],
  'White Nile, An Nil al Abya?, Sudan':      [13.0000,  32.5000],
  'Kosti, An Nil al Abya?, Sudan':           [13.1631,  32.6644],
  'Blue Nile, An Nil al Azraq, Sudan':       [11.5000,  34.0000],
  'Blue Nile State, An Nil al Azraq, Sudan': [11.5000,  34.0000],
  'Fula, An Nil al Azraq, Sudan':            [11.7200,  28.3800],
  'Al Jazirah, An Nil al Azraq, Sudan':      [14.5000,  33.5000],
  'El Gezira, An Nil al Azraq, Sudan':       [14.5000,  33.5000],
  'Wad Madani, Al Jazirah, Sudan':           [14.3910,  33.5199],
  'Wad Medani, Al Jazirah, Sudan':           [14.3910,  33.5199],
  'Medani, Al Jazirah, Sudan':               [14.3910,  33.5199],
  'Gezira State, Al Jazirah, Sudan':         [14.5000,  33.5000],
  'Bashair, Al Jazirah, Sudan':              [15.0000,  33.0000],
  'Abusham, Al Jazirah, Sudan':              [14.2000,  33.7000],
  'Muhammad Yusuf, Al Jazirah, Sudan':       [14.4000,  33.6000],
  'Sennar, Sinnar, Sudan':                   [13.5500,  33.6167],
  'Jebel Moya, Sinnar, Sudan':               [13.4000,  33.5000],
  'Sinja, Sinnar, Sudan':                    [13.1500,  33.9300],
  'Suwayda, Sinnar, Sudan':                  [13.3000,  33.8000],
  'Gedaref, Al Qa?arif, Sudan':              [14.0333,  35.3833],
  'El Gedaref, Al Qa?arif, Sudan':           [14.0333,  35.3833],
  'Kassala, Kassala, Sudan':                 [15.4591,  36.4000],
  'Wagga, Kassala, Sudan':                   [15.0000,  36.0000],
  'Port Sudan, Al Ba?r al A?mar, Sudan':     [19.6158,  37.2164],
  'Red Sea State, Al Ba?r al A?mar, Sudan':  [20.0000,  36.5000],
  'Merowe, Ash Shamaliyah, Sudan':           [18.4666,  31.8204],
  'Wadi Halfa, Ash Shamaliyah, Sudan':       [21.8093,  31.3528],
  'Dongola, Ash Shamaliyah, Sudan':          [19.1667,  30.4833],
  'Al Dabbah, Ash Shamaliyah, Sudan':        [18.0500,  30.9500],
  'Nile, Nahr an Nil, Sudan':                [17.0000,  33.5000],
  'River Nile, Nahr an Nil, Sudan':          [17.0000,  33.5000],
  'Abu Hamad, Nahr an Nil, Sudan':           [19.5333,  33.3167],
  'Meroe, Nahr an Nil, Sudan':               [16.9300,  33.7300],
  'Jebel Aulia, Sudan (general), Sudan':     [15.1000,  32.5000],
  'Sudan':                                   [12.8628,  30.2176],
}

interface Props {
  eventName: string
  height?: string
}

export default function LocationMap({ eventName, height = '100%' }: Props) {
  const [points, setPoints] = useState<{ name: string; lat: number; lon: number; count: number }[]>([])

  useEffect(() => {
    fetch(`/signals/${eventName}/location-frequency?limit=100`)
      .then((r) => r.json() as Promise<{ location: string; event_count: number }[]>)
      .then((rows) => {
        const mapped = rows
          .map((row) => {
            const coords = LOCATION_COORDS[row.location]
            if (!coords) return null
            return { name: row.location, lat: coords[0], lon: coords[1], count: row.event_count }
          })
          .filter(Boolean) as { name: string; lat: number; lon: number; count: number }[]
        setPoints(mapped)
      })
      .catch(() => {})
  }, [eventName])

  const maxCount = Math.max(...points.map((p) => p.count), 1)

  return (
    <MapContainer
      center={[15, 30]}
      zoom={6}
      scrollWheelZoom={false}
      zoomControl={false}
      attributionControl={false}
      style={{ width: '100%', height }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {points.map((p) => (
        <CircleMarker
          key={p.name}
          center={[p.lat, p.lon]}
          radius={6 + (p.count / maxCount) * 18}
          pathOptions={{
            fillColor: '#6366f1',
            fillOpacity: 0.8,
            color: '#ffffff',
            weight: 1,
          }}
        >
          <Tooltip>
            <span className="font-medium">{p.name.split(',')[0]}</span>
            <br />
            {p.count} events
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
