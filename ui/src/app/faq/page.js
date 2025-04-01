'use client';
import { useState } from 'react';
import { FaQuestionCircle, FaAngleDown, FaAngleUp } from 'react-icons/fa';

export default function FAQPage() {
  // State to track which accordion items are open
  const [openItems, setOpenItems] = useState({});

  // Toggle accordion item
  const toggleItem = (id) => {
    setOpenItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // FAQ data structured as objects with questions and answers
  const faqItems = [
    {
      id: 'daw',
      question: 'How can I use my own DAW to record audio?',
      answer: 'You can use any Digital Audio Workstation (DAW) of your choice to record and produce your tracks. Once you\'ve finished your track, export it as a high-quality MP3 or WAV file, then upload it to JamShot using our upload feature. We accept most common audio formats including MP3, WAV, AIFF, and FLAC.'
    },
    {
      id: 'algorithm',
      question: 'How does the feed algorithm work/why are 60-90s tracks favored by the algorithm?',
      answer: 'Our feed algorithm prioritizes engagement, freshness, and user preferences. Tracks that are 60-90 seconds tend to perform better because they\'re optimized for listener attention spans and completion rates. Short tracks typically have higher engagement metrics, which our algorithm interprets as quality content. For better visibility, consider creating tracks in this length range, though we support tracks of any duration.'
    },
    {
      id: 'rights',
      question: 'Do I own all the rights to a track that I post?',
      answer: 'Yes, you retain all ownership rights to the original content you create and upload to JamShot. However, by uploading to our platform, you grant JamShot a non-exclusive license to display, distribute, and use your content within our service. If your track contains samples or elements from other artists, you must ensure you have the proper rights or licenses to use those elements.'
    },
    {
      id: 'verified',
      question: 'How do I get verified?',
      answer: 'To get verified on JamShot, you need to meet certain eligibility criteria: have an active account with regular uploads, build a substantial following, and have a complete profile. Once eligible, you can apply for verification through your account settings. Our team will review your application and verify your identity. Verification provides a blue checkmark on your profile and access to additional features.'
    }
  ];

  return (
    <div className="faq-page container mx-auto py-8 px-4">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold mb-4">Frequently Asked Questions</h1>
        <p className="text-gray-600 dark:text-gray-300">
          Get answers to common questions about using JamShot
        </p>
      </div>

      <div className="max-w-3xl mx-auto">
        {faqItems.map((item) => (
          <div 
            key={item.id} 
            className="border-b border-gray-200 dark:border-gray-700 py-4"
          >
            <button
              onClick={() => toggleItem(item.id)}
              className="flex justify-between items-center w-full text-left font-semibold py-2 focus:outline-none"
            >
              <div className="flex items-center">
                <FaQuestionCircle className="text-primary-600 mr-3" />
                <span>{item.question}</span>
              </div>
              {openItems[item.id] ? (
                <FaAngleUp className="text-gray-500" />
              ) : (
                <FaAngleDown className="text-gray-500" />
              )}
            </button>
            
            {openItems[item.id] && (
              <div className="pl-9 pr-3 py-3 text-gray-600 dark:text-gray-300">
                <p>{item.answer}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 