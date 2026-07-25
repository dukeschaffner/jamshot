import FaDrumKit from '@/components/icons/FaDrumKit';
import FaViolin from '@/components/icons/FaViolin';
import FaDrums from '@/components/icons/FaDrums';
import FaPiano from '@/components/icons/FaPiano';
import FaPiano2 from '@/components/icons/FaPiano2';
import FaSaxophone from '@/components/icons/FaSaxophone';
import FaSoundwave from '@/components/icons/FaSoundwave';
import FaTrumpet from '@/components/icons/FaTrumpet';
import {FaGuitar, FaMusic} from  'react-icons/fa';
import {FaMicrophone} from  'react-icons/fa';

/**
 * Maps instrument names to their corresponding icon components
 * @param {string} instrumentName - The name of the instrument
 * @returns {React.Component} The icon component for the instrument
 */
export function getInstrumentIcon(instrumentName) {
  if (!instrumentName) return FaMusic;

  const normalizedName = instrumentName.toLowerCase().trim();

  const iconMap = {
    // Vocals
    'vocals': FaMicrophone,
    'vocals (rap)': FaMicrophone,
    'rap': FaMicrophone,
    
    // Guitars - using guitar icon for all string instruments
    'acoustic guitar': FaGuitar,
    'electric guitar': FaGuitar,
    'bass': FaGuitar,
    'ukulele': FaGuitar,
    
    // Keyboards - using piano/keyboard icons
    'piano': FaPiano,
    'keyboard': FaPiano2,
    'synthesizer': FaPiano2,
    'bass synth': FaPiano2,
    
    // Drums & Percussion - using music note variants
    'drums': FaDrumKit,
    'drum machine': FaDrumKit,
    'percussion': FaDrums,
    
    // Brass instruments - using music note
    'trumpet': FaTrumpet,
    'trombone': FaTrumpet,
    
    // Woodwind instruments - using music note variants
    'saxophone': FaSaxophone,
    'flute': FaMusic,
    'clarinet': FaMusic,
    'harmonica': FaMusic,
    
    // Strings - using music note
    'violin': FaViolin,
    'cello': FaViolin,
    'viola': FaViolin,
    
    // Electronic/DJ - using soundwave icon
    'dj/turntables': FaSoundwave,
    'turntables': FaSoundwave,
    'sampler': FaSoundwave,
    'fx': FaSoundwave,
  };

  return iconMap[normalizedName] || FaMusic;
}

/**
 * Gets the first instrument from a track's instruments array
 * Priority order: vocals > drums > guitar > first available
 * @param {Object} track - The track object
 * @returns {Object|null} The first instrument object or null
 */
export function getFirstInstrument(track) {
  if (!track || !track.instruments || !Array.isArray(track.instruments) || track.instruments.length === 0) {
    return null;
  }

  const instruments = track.instruments;

  // Helper function to normalize instrument name
  const normalizeName = (name) => {
    if (!name) return '';
    return name.toLowerCase().trim();
  };

  // Check for vocal type instruments first
  const vocalTypes = ['vocals', 'vocals (rap)', 'rap'];
  for (const instrument of instruments) {
    const normalizedName = normalizeName(instrument.name);
    if (vocalTypes.includes(normalizedName)) {
      return instrument;
    }
  }

  // Check for drums type instruments
  const drumsTypes = ['drums', 'drum machine', 'percussion'];
  for (const instrument of instruments) {
    const normalizedName = normalizeName(instrument.name);
    if (drumsTypes.includes(normalizedName)) {
      return instrument;
    }
  }

  // Check for guitar type instruments
  const guitarTypes = ['acoustic guitar', 'electric guitar', 'bass', 'ukulele'];
  for (const instrument of instruments) {
    const normalizedName = normalizeName(instrument.name);
    if (guitarTypes.includes(normalizedName)) {
      return instrument;
    }
  }

  // If no priority instruments found, return the first one
  return instruments[0];
}

/**
 * Gets the count of additional instruments (beyond the first one)
 * @param {Object} track - The track object
 * @returns {number} The count of additional instruments
 */
export function getAdditionalInstrumentCount(track) {
  if (!track || !track.instruments || !Array.isArray(track.instruments)) {
    return 0;
  }
  return Math.max(0, track.instruments.length - 1);
}

