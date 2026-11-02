import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, post, setUnauthorizedHandler } from './api';
import type { FiscalYear, Fund, Meta, User } from './types';
import { usePrefs } from './prefs';

interface Session {
  user: User | null;
  meta: Meta | undefined;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fy: FiscalYear | undefined;
  setFyId: (id: string) => void;
  fundBy: (source: string, nature: string) => Fund | undefined;
  can: { write: boolean; admin: boolean };
}
const Ctx = createContext<Session>(null as unknown as Session);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { setLang } = usePrefs();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [fyId, setFyId] = useState<string | null>(null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      qc.clear();
    });
    api<User>('/auth/me')
      .then((u) => {
        setUser(u);
        setLang(u.language, false);
      })
      .catch(() => setUser(null))
      .finally(() => setChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta'), enabled: !!user });
  const fy = meta.data?.fiscalYears.find((f) => f.id === (fyId ?? meta.data?.currentFiscalYearId));

  const value: Session = {
    user,
    meta: meta.data,
    loading: !checked || (!!user && meta.isLoading),
    login: async (username, password) => {
      const r = await post<{ user: User }>('/auth/login', { username, password });
      setUser(r.user);
      setLang(r.user.language, false);
    },
    logout: async () => {
      await post('/auth/logout').catch(() => {});
      setUser(null);
      qc.clear();
    },
    fy,
    setFyId,
    fundBy: (source, nature) => meta.data?.funds.find((f) => f.source === source.toUpperCase() && f.nature === nature.toUpperCase()),
    can: { write: user?.role === 'SUPER_ADMIN' || user?.role === 'ACCOUNTANT', admin: user?.role === 'SUPER_ADMIN' },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
