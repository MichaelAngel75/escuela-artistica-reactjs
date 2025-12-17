import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  timestamp,
  varchar,
  text,
  serial,
  pgSchema,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// 1) Bind everything to your schema
export const dbSchema = pgSchema(process.env.ACADEMY_DB_SCHEMA || "cat_admin"); // "academy_pohuazlicalli");

// 2) Enums under that schema
export const roleEnum = dbSchema.enum("role", [
  "admin",
  "teacher",
  "student",
]);

export const templateStatusEnum = dbSchema.enum("template_status", [
  "Active",
  "Inactive",
]);

export const batchStatusEnum = dbSchema.enum("batch_status", [
  "procesando",
  "completado",
  "error",
  "recibido",
]);

// 3) Tables under that schema

// Sessions table (inside academy_pohuazlicalli.sessions)
export const sessions = dbSchema.table(
  "po_sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table
export const users = dbSchema.table("po_users", {
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
export type Role =
  | "sys_admin"
  | "servicios_escolares"
  | "professor"
  | "student";

// Signatures table
export const signatures = dbSchema.table("po_signatures", {
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
export const templates = dbSchema.table("po_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  // ⚠ default must match enum case exactly ("Inactive", not "inactive")
  status: templateStatusEnum("status").notNull().default("Inactive"),
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
export const diplomaBatches = dbSchema.table("po_diploma_batches", {
  id: serial("id").primaryKey(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  status: batchStatusEnum("status").notNull().default("processing"),
  totalRecords: integer("total_records").notNull(),
  zipUrl: text("zip_url"),
  csvUrl: text("csv_url"),
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

// Configuration table
export const configuration = dbSchema.table("po_configuration_diploma", {
  id: serial("id").primaryKey(),
  fieldMappings: jsonb("field_mappings")
    .notNull()
    .$type<Record<string, string>>(),
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

// Relations (unchanged)
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
