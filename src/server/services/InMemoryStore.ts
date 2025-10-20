/**
 * InMemoryStore - Simple in-memory data storage
 *
 * Replaces Prisma/Mongoose for minimal mode
 * Trade-off: Data lost on restart, no persistence
 * Benefit: 80MB+ smaller, instant setup, no migrations
 */

import fs from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';

interface StorageItem<T> {
  id: string;
  data: T;
  createdAt: Date;
  updatedAt: Date;
}

interface User {
  id: string;
  email: string;
  password: string; // hashed
  name?: string;
  role: 'user' | 'admin';
  createdAt: Date;
}

interface Project {
  id: string;
  userId: string;
  name: string;
  url: string;
  status: 'pending' | 'cloning' | 'optimizing' | 'completed' | 'failed';
  projectDir: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PerformanceReport {
  id: string;
  projectId: string;
  score: number;
  metrics: any;
  issues: any[];
  recommendations: string[];
  createdAt: Date;
}

export class InMemoryStore {
  private users: Map<string, User> = new Map();
  private projects: Map<string, Project> = new Map();
  private performanceReports: Map<string, PerformanceReport> = new Map();
  private sessions: Map<string, any> = new Map();

  // Optional: Save to JSON file for basic persistence
  private persistencePath?: string;
  private autoSaveInterval?: NodeJS.Timeout;

  constructor(options?: { enablePersistence?: boolean; persistencePath?: string }) {
    if (options?.enablePersistence) {
      this.persistencePath = options.persistencePath || path.join(process.cwd(), 'data');
      this.loadFromDisk();
      this.startAutoSave();
    }
  }

  // ==================== USERS ====================

  async createUser(userData: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const user: User = {
      id: nanoid(),
      ...userData,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async getUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;

    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  // ==================== PROJECTS ====================

  async createProject(projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const project: Project = {
      id: nanoid(),
      ...projectData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.projects.set(project.id, project);
    return project;
  }

  async getProjectById(id: string): Promise<Project | null> {
    return this.projects.get(id) || null;
  }

  async getProjectsByUserId(userId: string): Promise<Project[]> {
    const projects: Project[] = [];
    for (const project of this.projects.values()) {
      if (project.userId === userId) {
        projects.push(project);
      }
    }
    return projects.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project | null> {
    const project = this.projects.get(id);
    if (!project) return null;

    const updated = { ...project, ...updates, updatedAt: new Date() };
    this.projects.set(id, updated);
    return updated;
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  async getAllProjects(): Promise<Project[]> {
    return Array.from(this.projects.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  // ==================== PERFORMANCE REPORTS ====================

  async createPerformanceReport(
    reportData: Omit<PerformanceReport, 'id' | 'createdAt'>
  ): Promise<PerformanceReport> {
    const report: PerformanceReport = {
      id: nanoid(),
      ...reportData,
      createdAt: new Date(),
    };
    this.performanceReports.set(report.id, report);
    return report;
  }

  async getPerformanceReportById(id: string): Promise<PerformanceReport | null> {
    return this.performanceReports.get(id) || null;
  }

  async getPerformanceReportsByProjectId(projectId: string): Promise<PerformanceReport[]> {
    const reports: PerformanceReport[] = [];
    for (const report of this.performanceReports.values()) {
      if (report.projectId === projectId) {
        reports.push(report);
      }
    }
    return reports.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async deletePerformanceReport(id: string): Promise<boolean> {
    return this.performanceReports.delete(id);
  }

  // ==================== SESSIONS ====================

  async createSession(sessionId: string, data: any): Promise<void> {
    this.sessions.set(sessionId, { ...data, createdAt: new Date() });
  }

  async getSession(sessionId: string): Promise<any | null> {
    return this.sessions.get(sessionId) || null;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async clearExpiredSessions(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    const now = Date.now();
    let cleared = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.createdAt.getTime();
      if (age > maxAge) {
        this.sessions.delete(sessionId);
        cleared++;
      }
    }

    return cleared;
  }

  // ==================== STATISTICS ====================

  getStatistics() {
    return {
      users: this.users.size,
      projects: this.projects.size,
      performanceReports: this.performanceReports.size,
      sessions: this.sessions.size,
      memoryUsage: process.memoryUsage(),
    };
  }

  // ==================== PERSISTENCE (OPTIONAL) ====================

  private async loadFromDisk() {
    if (!this.persistencePath) return;

    try {
      await fs.mkdir(this.persistencePath, { recursive: true });

      const usersFile = path.join(this.persistencePath, 'users.json');
      const projectsFile = path.join(this.persistencePath, 'projects.json');
      const reportsFile = path.join(this.persistencePath, 'reports.json');

      // Load users
      try {
        const usersData = await fs.readFile(usersFile, 'utf-8');
        const users = JSON.parse(usersData);
        this.users = new Map(users.map((u: User) => [u.id, u]));
        console.log(`[InMemoryStore] Loaded ${this.users.size} users from disk`);
      } catch {}

      // Load projects
      try {
        const projectsData = await fs.readFile(projectsFile, 'utf-8');
        const projects = JSON.parse(projectsData);
        this.projects = new Map(projects.map((p: Project) => [p.id, p]));
        console.log(`[InMemoryStore] Loaded ${this.projects.size} projects from disk`);
      } catch {}

      // Load reports
      try {
        const reportsData = await fs.readFile(reportsFile, 'utf-8');
        const reports = JSON.parse(reportsData);
        this.performanceReports = new Map(reports.map((r: PerformanceReport) => [r.id, r]));
        console.log(`[InMemoryStore] Loaded ${this.performanceReports.size} reports from disk`);
      } catch {}
    } catch (error) {
      console.error('[InMemoryStore] Failed to load from disk:', error);
    }
  }

  private async saveToDisk() {
    if (!this.persistencePath) return;

    try {
      await fs.mkdir(this.persistencePath, { recursive: true });

      const usersFile = path.join(this.persistencePath, 'users.json');
      const projectsFile = path.join(this.persistencePath, 'projects.json');
      const reportsFile = path.join(this.persistencePath, 'reports.json');

      await fs.writeFile(usersFile, JSON.stringify(Array.from(this.users.values()), null, 2));
      await fs.writeFile(projectsFile, JSON.stringify(Array.from(this.projects.values()), null, 2));
      await fs.writeFile(
        reportsFile,
        JSON.stringify(Array.from(this.performanceReports.values()), null, 2)
      );
    } catch (error) {
      console.error('[InMemoryStore] Failed to save to disk:', error);
    }
  }

  private startAutoSave() {
    // Save every 5 minutes
    this.autoSaveInterval = setInterval(() => {
      this.saveToDisk();
    }, 5 * 60 * 1000);
  }

  async shutdown() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    await this.saveToDisk();
    console.log('[InMemoryStore] Shutdown complete');
  }

  // ==================== UTILITY ====================

  clear() {
    this.users.clear();
    this.projects.clear();
    this.performanceReports.clear();
    this.sessions.clear();
  }
}

// Singleton instance
let storeInstance: InMemoryStore | null = null;

export function getStore(): InMemoryStore {
  if (!storeInstance) {
    storeInstance = new InMemoryStore({
      enablePersistence: process.env.NODE_ENV !== 'test',
      persistencePath: path.join(process.cwd(), 'data'),
    });
  }
  return storeInstance;
}

export async function shutdownStore() {
  if (storeInstance) {
    await storeInstance.shutdown();
    storeInstance = null;
  }
}
