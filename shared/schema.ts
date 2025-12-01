import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  serial,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Reference: blueprint:javascript_log_in_with_replit
// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Role enum for user types
export const roleEnum = pgEnum("role", [
  "sys_admin",
  "servicios_escolares",
  "professor",
  "student",
]);

// Status enums
export const templateStatusEnum = pgEnum("template_status", ["active", "inactive"]);
export const batchStatusEnum = pgEnum("batch_status", ["processing", "completed", "failed"]);

// Reference: blueprint:javascript_log_in_with_replit
// Users table with Replit Auth integration
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: roleEnum("role").notNull().default("student"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Role = "sys_admin" | "servicios_escolares" | "professor" | "student";

// Signatures table
export const signatures = pgTable("signatures", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  professorName: varchar("professor_name", { length: 255 }).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSignatureSchema = createInsertSchema(signatures).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSignature = z.infer<typeof insertSignatureSchema>;
export type Signature = typeof signatures.$inferSelect;

// Templates table
export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  status: templateStatusEnum("status").notNull().default("inactive"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Template = typeof templates.$inferSelect;

// Diploma batches table
export const diplomaBatches = pgTable("diploma_batches", {
  id: serial("id").primaryKey(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  status: batchStatusEnum("status").notNull().default("processing"),
  totalRecords: serial("total_records").notNull(),
  zipUrl: text("zip_url"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDiplomaBatchSchema = createInsertSchema(diplomaBatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDiplomaBatch = z.infer<typeof insertDiplomaBatchSchema>;
export type DiplomaBatch = typeof diplomaBatches.$inferSelect;

// Configuration table for field mappings
export const configuration = pgTable("configuration", {
  id: serial("id").primaryKey(),
  fieldMappings: jsonb("field_mappings").notNull().$type<Record<string, string>>(),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertConfigurationSchema = createInsertSchema(configuration).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertConfiguration = z.infer<typeof insertConfigurationSchema>;
export type Configuration = typeof configuration.$inferSelect;

// Relations
export const signaturesRelations = relations(signatures, ({ one }) => ({
  createdBy: one(users, {
    fields: [signatures.createdBy],
    references: [users.id],
  }),
}));

export const templatesRelations = relations(templates, ({ one }) => ({
  createdBy: one(users, {
    fields: [templates.createdBy],
    references: [users.id],
  }),
}));

export const diplomaBatchesRelations = relations(diplomaBatches, ({ one }) => ({
  createdBy: one(users, {
    fields: [diplomaBatches.createdBy],
    references: [users.id],
  }),
}));
