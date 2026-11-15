import { useQuery } from '@tanstack/react-query';
import { getProfile } from '../api/auth.js';
import { useAuth } from './session.js';

export function useProfile() {
  const account = useAuth().session!.account;
  return useQuery({ queryKey: ['auth', account.id, 'profile'], queryFn: ({ signal }) => getProfile(signal), retry: false, staleTime: 30000 });
}
