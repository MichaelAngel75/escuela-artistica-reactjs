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
export const dbSchema = pgSchema("schema_pohualizcalli"); 

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
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table
export const users = dbSchema.table("users", {
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
export const signatures = dbSchema.table("signatures", {
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
export const templates = dbSchema.table("templates", {
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
export const diplomaBatches = dbSchema.table("diploma_batches", {
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
export const configuration = dbSchema.table("configuration_diploma", {
  id: serial("id").primaryKey(),
  fieldMappings: jsonb("field_mappings")
    .notNull()
    .$type<Record<string, string>>(),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Diploma configuration table
export const diplomaConfiguration = dbSchema.table("configuration_diploma", {
  id: serial("id").primaryKey(),
  fieldMappings: jsonb("field_mappings").notNull().$type<FieldMappings>(),
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

// -------------------------------------------------------

// Font configuration for PDF generation (Python compatible)
export const fontSchema = z.object({
  name: z.string(),
  size: z.number().min(8).max(48),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color"),
});

export type FontConfig = z.infer<typeof fontSchema>;

// Field configuration types
export const estudianteConfigSchema = z.object({
  y: z.number().min(0),
  centered: z.boolean(),
  x: z.number().min(0).optional(),
  font: fontSchema,
});

export const cursoConfigSchema = z.object({
  y: z.number().min(0),
  centered: z.boolean(),
  x: z.number().min(0).optional(),
  font: fontSchema,
});

export const profesorSignatureConfigSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  size: z.number().min(50).max(200),
});

export const profesorConfigSchema = z.object({
  x_range: z.tuple([z.number().min(0), z.number().min(0)]),
  y: z.number().min(0),
  font: fontSchema,
});

export const fechaConfigSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  font: fontSchema,
});

// Complete field mappings schema
export const fieldMappingsSchema = z.object({
  estudiante: estudianteConfigSchema,
  curso: cursoConfigSchema,
  "profesor-signature": profesorSignatureConfigSchema,
  profesor: profesorConfigSchema,
  fecha: fechaConfigSchema,
});

export type FieldMappings = z.infer<typeof fieldMappingsSchema>;




export const insertDiplomaConfigSchema = createInsertSchema(diplomaConfiguration).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDiplomaConfig = z.infer<typeof insertDiplomaConfigSchema>;
export type DiplomaConfig = typeof diplomaConfiguration.$inferSelect;



// Default configuration values
export const defaultFieldMappings: FieldMappings = {
  estudiante: {
    y: 300,
    centered: true,
    font: { name: "Helvetica-Bold", size: 24, color: "#6D28D9" },
  },
  curso: {
    y: 253,
    centered: true,
    font: { name: "Helvetica-Bold", size: 12, color: "#374151" },
  },
  "profesor-signature": {
    x: 442,
    y: 100,
    size: 125,
  },
  profesor: {
    x_range: [433, 573],
    y: 97,
    font: { name: "Helvetica", size: 12, color: "#000000" },
  },
  fecha: {
    x: 418,
    y: 25,
    font: { name: "Helvetica", size: 12, color: "#000000" },
  },
};

// Python-compatible PDF fonts
export const AVAILABLE_FONTS = [
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-Oblique",
  "Helvetica-BoldOblique",
  "Times-Roman",
  "Times-Bold",
  "Times-Italic",
  "Times-BoldItalic",
  "Courier",
  "Courier-Bold",
  "Courier-Oblique",
  "Courier-BoldOblique",
] as const;

export type AvailableFont = typeof AVAILABLE_FONTS[number];
