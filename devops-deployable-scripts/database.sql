--------------------------------------------------
--- Database creation by command line on SSH

psql \
   -h localhost \
   -p 35998 \
   -U postgres \
   -d postgres

SELECT current_database(), current_user;

\l   --> list all tables

CREATE DATABASE pohualizcalli OWNER postgres;


CREATE USER pohualizcalli_usuario WITH PASSWORD 'MY-PASSWORD-12345';

-- Remove default access
--REVOKE ALL ON DATABASE current_database() FROM PUBLIC;
REVOKE ALL ON DATABASE pohualizcalli FROM PUBLIC;

-- Allow app user to connect ONLY to this DB
--GRANT CONNECT ON DATABASE current_database() TO pohualizcalli_usuario;
GRANT CONNECT ON DATABASE pohualizcalli TO pohualizcalli_usuario;

CREATE SCHEMA IF NOT EXISTS schema_pohualizcalli AUTHORIZATION postgres;

SELECT nspname, pg_get_userbyid(nspowner)
FROM pg_namespace
WHERE nspname = 'schema_pohualizcalli';
      nspname        | pg_get_userbyid 
----------------------+-----------------
 schema_pohualizcalli | postgres
(1 row)



REVOKE ALL ON SCHEMA schema_pohualizcalli FROM PUBLIC;

GRANT USAGE ON SCHEMA schema_pohualizcalli TO pohualizcalli_usuario;
REVOKE CREATE ON SCHEMA schema_pohualizcalli FROM pohualizcalli_usuario;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA schema_pohualizcalli
TO pohualizcalli_usuario;


GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA schema_pohualizcalli
TO pohualizcalli_usuario;


--- ensure future tables 
ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA schema_pohualizcalli
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLES
TO pohualizcalli_usuario;

ALTER DEFAULT PRIVILEGES
FOR ROLE postgres
IN SCHEMA schema_pohualizcalli
GRANT USAGE, SELECT
ON SEQUENCES
TO pohualizcalli_usuario;


---- verify access:
SELECT
  has_schema_privilege('pohualizcalli_usuario', 'schema_pohualizcalli', 'USAGE')  AS can_use_schema,
  has_schema_privilege('pohualizcalli_usuario', 'schema_pohualizcalli', 'CREATE') AS can_create_schema;

can_use_schema | can_create_schema 
----------------+-------------------
 t              | f
(1 row)



-----------------------------------------------------------------------------------------------
-----------------------------------------------------------------------------------------------

------------------------------
SHOW ssl;
SHOW ssl_prefer_server_ciphers;
SHOW ssl_min_protocol_version;

SHOW rds.force_ssl;


-------------------------------------------------------------------------------------------------------------------
-- schema_pohualizcalli.sessions definition

-- Drop table

-- DROP TABLE schema_pohualizcalli.sessions;

CREATE TABLE IF NOT EXISTS schema_pohualizcalli.sessions (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
--  sess jsonb NOT NULL,
  expire timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expire
  ON schema_pohualizcalli.sessions (expire);

--CREATE INDEX "IDX_session_expire" ON schema_pohualizcalli.sessions USING btree (expire);


-------------------------------------------------------------------------------------------------------------------
-- schema_pohualizcalli.users definition
-- Drop table
-- DROP TABLE schema_pohualizcalli.users;

CREATE TYPE schema_pohualizcalli.role AS ENUM (
  'student',
  'teacher',
  'admin',
  'servicios_escolares'
);


CREATE TABLE schema_pohualizcalli.users (
  id varchar DEFAULT gen_random_uuid() NOT NULL,
  email varchar UNIQUE,
  first_name varchar,
  last_name varchar,
  profile_image_url varchar,
  "role" schema_pohualizcalli.role DEFAULT 'student' NOT NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  PRIMARY KEY (id)
);


--- -----------------------------------------------------------------------------------------------------------------------
-- schema_pohualizcalli."configuration" definition
-- Drop table
-- DROP TABLE schema_pohualizcalli."configuration";
CREATE TABLE schema_pohualizcalli.configuration_diploma (
--	id serial4 NOT NULL,
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	field_mappings jsonb NOT NULL,
	updated_by varchar NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT configuration_pkey PRIMARY KEY (id)
);


-- schema_pohualizcalli."configuration" foreign keys
ALTER TABLE schema_pohualizcalli.configuration_diploma ADD CONSTRAINT configuration_updated_by_users_id_fk_01 FOREIGN KEY (updated_by) REFERENCES schema_pohualizcalli.users(email);


---- insertar default configuration:
INSERT INTO cat_admin.users (field_mappings,updated_by,created_at,updated_at) VALUES
	 ('{"curso": {"y": 253, "font": {"name": "Helvetica-Bold", "size": 12, "color": "#374151"}, "centered": true}, "fecha": {"x": 418, "y": 25, "font": {"name": "Helvetica", "size": 12, "color": "#000000"}}, "profesor": {"y": 97, "font": {"name": "Helvetica", "size": 12, "color": "#000000"}, "x_range": [433, 573]}, "estudiante": {"y": 300, "font": {"name": "Helvetica-Bold", "size": 24, "color": "#6D28D9"}, "centered": true}, "profesor-signature": {"x": 442, "y": 100, "size": 125}}',NULL,'2025-12-21 17:38:45.334274','2025-12-21 17:38:45.334274');



-------------------------------------------------------------------------------------------------------------------

CREATE TYPE schema_pohualizcalli.batch_status AS ENUM (
  'procesando',
  'completado',
  'error',
  'recibido'
);


-- schema_pohualizcalli.diploma_batches definition
-- Drop table
-- DROP TABLE schema_pohualizcalli.diploma_batches;
CREATE TABLE schema_pohualizcalli.diploma_batches (
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	file_name varchar(255) NOT NULL,
	status schema_pohualizcalli."batch_status" DEFAULT 'recibido'::schema_pohualizcalli.batch_status NOT NULL,
	total_records serial4 NOT NULL,
	zip_url text NULL,
	created_by varchar NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	csv_url varchar NULL,
	CONSTRAINT diploma_batches_pkey PRIMARY KEY (id)
);


-- schema_pohualizcalli.diploma_batches foreign keys

ALTER TABLE schema_pohualizcalli.diploma_batches ADD CONSTRAINT diploma_batches_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES schema_pohualizcalli.users(email);

---  insert
INSERT INTO schema_pohualizcalli.diploma_batches
(id, file_name, status, total_records, zip_url, created_by, created_at, updated_at)
VALUES(nextval('diploma_batches_id_seq'::regclass), '', 'processing'::batch_status, nextval('diploma_batches_total_records_seq'::regclass), '', '', now(), now());




-------------------------------------------------------------------------------------------------------------------

-- schema_pohualizcalli.signatures definition
-- Drop table
-- DROP TABLE schema_pohualizcalli.signatures;
CREATE TABLE schema_pohualizcalli.signatures (
--	id serial4 NOT NULL,
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	"name" varchar(255) NOT NULL,
	url text NOT NULL,
	professor_name varchar(255) NOT NULL,
	created_by varchar NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT signatures_pkey PRIMARY KEY (id)
);


-- schema_pohualizcalli.signatures foreign keys

ALTER TABLE schema_pohualizcalli.signatures ADD CONSTRAINT signatures_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES schema_pohualizcalli.users(email);



-------------------------------------------------------------------------------------------------------------------

CREATE TYPE schema_pohualizcalli.template_status AS ENUM (
  'Active',
  'Inactive'
);
-- schema_pohualizcalli.templates definition
-- Drop table
-- DROP TABLE schema_pohualizcalli.templates;
CREATE TABLE schema_pohualizcalli.templates (
--	id serial4 NOT NULL,
    id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	"name" varchar(255) NOT NULL,
	url text NOT NULL,
	status schema_pohualizcalli."template_status" DEFAULT 'Inactive' NOT NULL,
	created_by varchar NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT templates_pkey PRIMARY KEY (id)
);


-- schema_pohualizcalli.templates foreign keys

ALTER TABLE schema_pohualizcalli.templates ADD CONSTRAINT templates_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES schema_pohualizcalli.users(email);



-------------------------------------------------------------------------------------------------------------------
-----------------  S3 templates:
---- arn:aws:s3:::my-bucket
---  /<my-bucket-name>/generacion-diplomas/empty-templates/<4-digit-year>
---  /<my-bucket-name>//generacion-diplomas/signatures/<4-digit-year>/
---  /<my-bucket-name>//generacion-diplomas/generated-diplomas/<id-generation-db>


ACADEMY_INTERNAL_APP_DOMAIN   ???
ACADEMY_DEV_DOMAIN            ???
ACADEMY_PUBLIC_OBJECT_SEARCH_PATHS=/pohualizcalli-several-files/no-exist-this-folder     =====>  no needed 


------ ###################################################################################
/pohualizcalli/ssm/

ACADEMY_NODE_ENV=
ACADEMY_DB_SECRET_MANAGER=
ACADEMY_DB_SCHEMA=
ACADEMY_SESSION_SECRET=
ACADEMY_GOOGLE_CLIENT_ID=
ACADEMY_GOOGLE_CLIENT_SECRET=
ACADEMY_GOOGLE_CALLBACK_URL=
ACADEMY_PORT=
ACADEMY_PRIVATE_OBJECT_DIR=
ACADEMY_SQS_DIPLOMA_GENERATION=
ACADEMY_AWS_REGION=
ACADEMY_S3_BUCKET=
ACADEMY_RESOURCES_DOMAIN=
