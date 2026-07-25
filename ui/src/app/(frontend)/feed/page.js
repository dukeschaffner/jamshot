import HomeFeed from '../HomeFeed';

export const metadata = {
  title: 'Home Feed — Sterio',
  description: 'Browse the latest tracks and collaborations on Sterio.',
  robots: { index: false, follow: true },
};

export default function FeedPage() {
  return <HomeFeed />;
}
