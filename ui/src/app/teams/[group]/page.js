'use client';
import { useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { groupApi } from '../../../lib/api';

/**
 * Dynamic route for predefined team landing pages
 * Example: /teams/life-church
 * 
 * This page logs the visit (if the group exists in the database) and
 * redirects to the main /teams page
 */
export default function TeamGroupPage() {
  const router = useRouter();
  const params = useParams();
  const hasLoggedVisit = useRef(false);

  useEffect(() => {
    const logVisitAndRedirect = async () => {
      // Prevent duplicate logging (React 18 Strict Mode causes double effect runs)
      if (hasLoggedVisit.current) {
        return;
      }
      hasLoggedVisit.current = true;

      const groupName = params.group;
      
      if (groupName) {
        try {
          // Log the visit - this will only actually log if the group exists in DB
          await groupApi.logVisit(groupName, 'team');
        } catch (error) {
          // Silently fail - we don't want to block the redirect
          console.error('Error logging group visit:', error);
        }
      }

      // Redirect to the main teams page
      router.replace('/teams');
    };

    logVisitAndRedirect();
  }, [params.group, router]);

  // Show nothing while redirecting
  return null;
}

