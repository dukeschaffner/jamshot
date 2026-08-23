import { generateTrackMetadata } from '@/lib/trackMetadata';

export async function generateMetadata({ params }) {
  return generateTrackMetadata({ params });
}

export default function TrackLayout({ children }) {
  return children;
}
