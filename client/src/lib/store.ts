import { create } from 'zustand';

export type Role = 'sys_admin' | 'servicios_escolares' | 'student' | 'professor';

export interface User {
  id: string;
  name: string;
  email: string;
  photoUrl: string;
  role: Role;
  googleId: string;
}

export interface Signature {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  professorName: string;
}

export interface Template {
  id: string;
  name: string;
  thumbnailUrl: string;
  createdAt: string;
  status: 'active' | 'inactive';
}

export interface DiplomaBatch {
  id: string;
  fileName: string;
  createdAt: string;
  status: 'processing' | 'completed' | 'failed';
  totalRecords: number;
  zipUrl?: string;
}

// Mock Data Store
interface AppStore {
  user: User | null;
  users: User[];
  signatures: Signature[];
  templates: Template[];
  diplomaBatches: DiplomaBatch[];
  login: () => void;
  logout: () => void;
  addUser: (user: Omit<User, 'id'>) => void;
  updateUser: (id: string, data: Partial<User>) => void;
  deleteUser: (id: string) => void;
  addSignature: (sig: Omit<Signature, 'id' | 'createdAt'>) => void;
  updateSignature: (id: string, data: Partial<Signature>) => void;
  deleteSignature: (id: string) => void;
  addTemplate: (temp: Omit<Template, 'id' | 'createdAt'>) => void;
  updateTemplate: (id: string, data: Partial<Template>) => void;
  toggleTemplateStatus: (id: string) => void;
  deleteTemplate: (id: string) => void;
  addDiplomaBatch: (batch: Omit<DiplomaBatch, 'id' | 'createdAt'>) => void;
  updateDiplomaBatchStatus: (id: string, status: DiplomaBatch['status'], zipUrl?: string) => void;
}

const MOCK_USERS: User[] = [
  {
    id: '1',
    name: 'Admin User',
    email: 'admin@Pohualizcalli.edu',
    photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
    role: 'sys_admin',
    googleId: 'google-123'
  },
  {
    id: '2',
    name: 'School Services',
    email: 'services@Pohualizcalli.edu',
    photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Services',
    role: 'servicios_escolares',
    googleId: 'google-456'
  },
  {
    id: '3',
    name: 'Professor Smith',
    email: 'smith@Pohualizcalli.edu',
    photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Smith',
    role: 'professor',
    googleId: 'google-789'
  }
];

const MOCK_SIGNATURES: Signature[] = [
  {
    id: '1',
    name: 'Director Signature',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/John_Hancock_Signature.svg/1200px-John_Hancock_Signature.svg.png',
    createdAt: '2025-01-15',
    professorName: 'Dr. John Hancock'
  },
  {
    id: '2',
    name: 'Dean Signature',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Signature_of_John_Adams.svg/2560px-Signature_of_John_Adams.svg.png',
    createdAt: '2025-02-20',
    professorName: 'Dr. John Adams'
  }
];

const MOCK_TEMPLATES: Template[] = [
  {
    id: '1',
    name: 'Standard Diploma 2025',
    thumbnailUrl: 'https://img.freepik.com/free-vector/elegant-diploma-certificate-template_23-2147893987.jpg',
    createdAt: '2025-01-01',
    status: 'active'
  },
  {
    id: '2',
    name: 'Legacy Certificate',
    thumbnailUrl: 'https://img.freepik.com/free-vector/modern-certificate-template_23-2147893988.jpg',
    createdAt: '2024-01-01',
    status: 'inactive'
  }
];

const MOCK_BATCHES: DiplomaBatch[] = [
    { id: '1', fileName: 'course_cs101.csv', createdAt: '2025-03-01T10:00:00', status: 'completed', totalRecords: 45, zipUrl: '#' },
    { id: '2', fileName: 'course_math202.csv', createdAt: '2025-03-02T14:30:00', status: 'failed', totalRecords: 12 }
];

export const useAppStore = create<AppStore>((set) => ({
  user: null, // Start logged out
  users: MOCK_USERS,
  signatures: MOCK_SIGNATURES,
  templates: MOCK_TEMPLATES,
  diplomaBatches: MOCK_BATCHES,

  login: () => set({ user: MOCK_USERS[0] }), // Mock login as Admin
  logout: () => set({ user: null }),
  
  addUser: (userData) => set((state) => ({
    users: [...state.users, { ...userData, id: Math.random().toString(36).substr(2, 9) }]
  })),
  
  updateUser: (id, data) => set((state) => ({
    users: state.users.map(u => u.id === id ? { ...u, ...data } : u)
  })),
  
  deleteUser: (id) => set((state) => ({
    users: state.users.filter(u => u.id !== id)
  })),

  addSignature: (sigData) => set((state) => ({
    signatures: [...state.signatures, { 
      ...sigData, 
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString().split('T')[0]
    }]
  })),

  updateSignature: (id, data) => set((state) => ({
    signatures: state.signatures.map(s => s.id === id ? { ...s, ...data } : s)
  })),

  deleteSignature: (id) => set((state) => ({
    signatures: state.signatures.filter(s => s.id !== id)
  })),

  addTemplate: (tempData) => set((state) => ({
    templates: [...state.templates, {
      ...tempData,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString().split('T')[0]
    }]
  })),

  updateTemplate: (id, data) => set((state) => ({
    templates: state.templates.map(t => t.id === id ? { ...t, ...data } : t)
  })),

  toggleTemplateStatus: (id) => set((state) => ({
    templates: state.templates.map(t => {
      if (t.id === id) return { ...t, status: t.status === 'active' ? 'inactive' : 'active' };
      if (t.id !== id && state.templates.find(x => x.id === id)?.status === 'inactive') {
         return t; 
      }
      return t;
    }).map(t => {
        const target = state.templates.find(x => x.id === id);
        if (target?.status === 'inactive' && t.id !== id) return { ...t, status: 'inactive' }; // Deactivate others if activating target
        return t;
    })
  })),

  deleteTemplate: (id) => set((state) => ({
    templates: state.templates.filter(t => t.id !== id)
  })),

  addDiplomaBatch: (batch) => set((state) => ({
      diplomaBatches: [{ ...batch, id: Math.random().toString(36).substr(2, 9), createdAt: new Date().toISOString() }, ...state.diplomaBatches]
  })),

  updateDiplomaBatchStatus: (id, status, zipUrl) => set((state) => ({
      diplomaBatches: state.diplomaBatches.map(b => b.id === id ? { ...b, status, zipUrl } : b)
  }))

}));
