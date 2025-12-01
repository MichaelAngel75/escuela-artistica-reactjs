import {
  users,
  signatures,
  templates,
  diplomaBatches,
  configuration,
  type User,
  type UpsertUser,
  type Signature,
  type InsertSignature,
  type Template,
  type InsertTemplate,
  type DiplomaBatch,
  type InsertDiplomaBatch,
  type Configuration,
  type InsertConfiguration,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

// Reference: blueprint:javascript_database
// Reference: blueprint:javascript_log_in_with_replit
export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Signature operations
  getSignatures(): Promise<Signature[]>;
  getSignature(id: number): Promise<Signature | undefined>;
  createSignature(signature: InsertSignature): Promise<Signature>;
  updateSignature(id: number, signature: Partial<InsertSignature>): Promise<Signature | undefined>;
  deleteSignature(id: number): Promise<void>;
  
  // Template operations
  getTemplates(): Promise<Template[]>;
  getTemplate(id: number): Promise<Template | undefined>;
  getActiveTemplate(): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(id: number, template: Partial<InsertTemplate>): Promise<Template | undefined>;
  setTemplateActive(id: number): Promise<void>;
  deleteTemplate(id: number): Promise<void>;
  
  // Diploma batch operations
  getDiplomaBatches(): Promise<DiplomaBatch[]>;
  getDiplomaBatch(id: number): Promise<DiplomaBatch | undefined>;
  createDiplomaBatch(batch: InsertDiplomaBatch): Promise<DiplomaBatch>;
  updateDiplomaBatch(id: number, batch: Partial<InsertDiplomaBatch>): Promise<DiplomaBatch | undefined>;
  
  // Configuration operations
  getConfiguration(): Promise<Configuration | undefined>;
  upsertConfiguration(config: InsertConfiguration): Promise<Configuration>;
}

export class DatabaseStorage implements IStorage {
  // User operations (mandatory for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }
  
  // Signature operations
  async getSignatures(): Promise<Signature[]> {
    return await db.select().from(signatures).orderBy(desc(signatures.createdAt));
  }
  
  async getSignature(id: number): Promise<Signature | undefined> {
    const [signature] = await db.select().from(signatures).where(eq(signatures.id, id));
    return signature;
  }
  
  async createSignature(signatureData: InsertSignature): Promise<Signature> {
    const [signature] = await db.insert(signatures).values(signatureData).returning();
    return signature;
  }
  
  async updateSignature(id: number, signatureData: Partial<InsertSignature>): Promise<Signature | undefined> {
    const [signature] = await db
      .update(signatures)
      .set({ ...signatureData, updatedAt: new Date() })
      .where(eq(signatures.id, id))
      .returning();
    return signature;
  }
  
  async deleteSignature(id: number): Promise<void> {
    await db.delete(signatures).where(eq(signatures.id, id));
  }
  
  // Template operations
  async getTemplates(): Promise<Template[]> {
    return await db.select().from(templates).orderBy(desc(templates.createdAt));
  }
  
  async getTemplate(id: number): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(eq(templates.id, id));
    return template;
  }
  
  async getActiveTemplate(): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(eq(templates.status, 'active'));
    return template;
  }
  
  async createTemplate(templateData: InsertTemplate): Promise<Template> {
    const [template] = await db.insert(templates).values(templateData).returning();
    return template;
  }
  
  async updateTemplate(id: number, templateData: Partial<InsertTemplate>): Promise<Template | undefined> {
    const [template] = await db
      .update(templates)
      .set({ ...templateData, updatedAt: new Date() })
      .where(eq(templates.id, id))
      .returning();
    return template;
  }
  
  async setTemplateActive(id: number): Promise<void> {
    // Deactivate all templates first
    await db.update(templates).set({ status: 'inactive' });
    // Activate the selected template
    await db.update(templates).set({ status: 'active' }).where(eq(templates.id, id));
  }
  
  async deleteTemplate(id: number): Promise<void> {
    await db.delete(templates).where(eq(templates.id, id));
  }
  
  // Diploma batch operations
  async getDiplomaBatches(): Promise<DiplomaBatch[]> {
    return await db.select().from(diplomaBatches).orderBy(desc(diplomaBatches.createdAt));
  }
  
  async getDiplomaBatch(id: number): Promise<DiplomaBatch | undefined> {
    const [batch] = await db.select().from(diplomaBatches).where(eq(diplomaBatches.id, id));
    return batch;
  }
  
  async createDiplomaBatch(batchData: InsertDiplomaBatch): Promise<DiplomaBatch> {
    const [batch] = await db.insert(diplomaBatches).values(batchData).returning();
    return batch;
  }
  
  async updateDiplomaBatch(id: number, batchData: Partial<InsertDiplomaBatch>): Promise<DiplomaBatch | undefined> {
    const [batch] = await db
      .update(diplomaBatches)
      .set({ ...batchData, updatedAt: new Date() })
      .where(eq(diplomaBatches.id, id))
      .returning();
    return batch;
  }
  
  // Configuration operations
  async getConfiguration(): Promise<Configuration | undefined> {
    const [config] = await db.select().from(configuration).limit(1);
    return config;
  }
  
  async upsertConfiguration(configData: InsertConfiguration): Promise<Configuration> {
    const existing = await this.getConfiguration();
    if (existing) {
      const [config] = await db
        .update(configuration)
        .set({ ...configData, updatedAt: new Date() })
        .where(eq(configuration.id, existing.id))
        .returning();
      return config;
    } else {
      const [config] = await db.insert(configuration).values(configData).returning();
      return config;
    }
  }
}

export const storage = new DatabaseStorage();
