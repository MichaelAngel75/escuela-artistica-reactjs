
--- -----------------------------------------------------------------------------------------------------------------------
---   Creates DB Schema and user
--- Create user is to create a role --
CREATE USER app_pohualizcalli WITH PASSWORD 'MyGat0No10enc0nTr4r45p0rqu3N03st4';
GRANT CONNECT ON DATABASE pohualizcalli TO app_pohualizcalli;


CREATE USER app_user WITH PASSWORD 'mypassword123';
CREATE SCHEMA academy_pohuazlicalli AUTHORIZATION postgres;


REVOKE ALL ON SCHEMA academy_pohuazlicalli FROM app_pohualizcalli;
GRANT USAGE ON SCHEMA academy_pohuazlicalli TO app_pohualizcalli;
GRANT ALL ON SCHEMA academy_pohuazlicalli TO postgres;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA academy_pohuazlicalli TO app_pohualizcalli;

--- despues de creacion de las tablas
GRANT SELECT, INSERT, UPDATE, DELETE ON
  academy_pohuazlicalli.configuration_diploma,
  academy_pohuazlicalli.diploma_batches,
  academy_pohuazlicalli.sessions,
  academy_pohuazlicalli.signatures,
  academy_pohuazlicalli.templates,
  academy_pohuazlicalli.users
TO app_pohualizcalli;

----- despues de creacion de las tablas
--GRANT USAGE, SELECT ON SEQUENCE
--  academy_pohuazlicalli.configuration_id_seq,
--  academy_pohuazlicalli.diploma_batches_id_seq,
--  academy_pohuazlicalli.diploma_batches_total_records_seq,
--  academy_pohuazlicalli.signatures_id_seq,
--  academy_pohuazlicalli.templates_id_seq
--TO app_pohualizcalli;


-- 1) Grant USAGE on the enum types
GRANT USAGE ON TYPE
  academy_pohuazlicalli.role,
  academy_pohuazlicalli.batch_status,
  academy_pohuazlicalli.template_status
TO app_pohualizcalli;


-------------------------------------------------------------------------------------------------------------------
--- recommended:  POSTGRES_HOST_AUTH_METHOD=trust
SHOW hba_file;
SELECT pg_reload_conf();  --- permission denied
SHOW ssl;    ---- is ON
SHOW ssl_cert_file;
SHOW ssl_key_file;
SHOW ssl_ca_file;
SELECT 
    ssl, *
--    ssl_cipher,
--    ssl_version
FROM pg_stat_ssl 
WHERE pid = pg_backend_pid();
------------------------------
SELECT 
    pid,
    usename,
    client_addr,
    ssl
--    ssl_cipher,
--    ssl_version
FROM pg_stat_ssl
JOIN pg_stat_activity USING (pid)
ORDER BY pid;
------------------------------
SHOW ssl;
SHOW ssl_prefer_server_ciphers;
SHOW ssl_min_protocol_version;

SHOW rds.force_ssl;



-------------------------------------------------------------------------------------------------------------------


-- academy_pohuazlicalli.users definition

-- Drop table

-- DROP TABLE academy_pohuazlicalli.users;

CREATE TYPE academy_pohuazlicalli.role AS ENUM (
  'student',
  'teacher',
  'admin'
);


CREATE TABLE academy_pohuazlicalli.users_pohualizcalli (
  id varchar DEFAULT gen_random_uuid() NOT NULL,
  email varchar UNIQUE,
  first_name varchar,
  last_name varchar,
  profile_image_url varchar,
  "role" academy_pohuazlicalli.role DEFAULT 'student' NOT NULL,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  PRIMARY KEY (id)
);





--- -----------------------------------------------------------------------------------------------------------------------
-- academy_pohuazlicalli."configuration" definition

-- Drop table

-- DROP TABLE academy_pohuazlicalli."configuration";

CREATE TABLE academy_pohuazlicalli.configuration_diploma (
--	id serial4 NOT NULL,
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	field_mappings jsonb NOT NULL,
	updated_by varchar NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT configuration_pkey PRIMARY KEY (id)
);


-- academy_pohuazlicalli."configuration" foreign keys

ALTER TABLE academy_pohuazlicalli.configuration_diploma ADD CONSTRAINT configuration_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES academy_pohuazlicalli.users(id);


INSERT INTO academy_pohuazlicalli.configuration_diploma
(id, field_mappings, updated_by, created_at, updated_at)
VALUES(nextval('configuration_id_seq'::regclass), '', '', now(), now());

-------------------------------------------------------------------------------------------------------------------

CREATE TYPE academy_pohuazlicalli.batch_status AS ENUM (
  'procesando',
  'completado',
  'error',
  'recibido'
);


-- academy_pohuazlicalli.diploma_batches definition

-- Drop table

-- DROP TABLE academy_pohuazlicalli.diploma_batches;

CREATE TABLE academy_pohuazlicalli.diploma_batches (
--	id serial4 NOT NULL,
	id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	file_name varchar(255) NOT NULL,
	status academy_pohuazlicalli."batch_status" DEFAULT 'recibido' NOT NULL,
	total_records serial4 NOT NULL,
	zip_url text NULL,
	created_by varchar NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT diploma_batches_pkey PRIMARY KEY (id)
);


-- academy_pohuazlicalli.diploma_batches foreign keys

ALTER TABLE academy_pohuazlicalli.diploma_batches ADD CONSTRAINT diploma_batches_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES academy_pohuazlicalli.users(id);

INSERT INTO academy_pohuazlicalli.diploma_batches
(id, file_name, status, total_records, zip_url, created_by, created_at, updated_at)
VALUES(nextval('diploma_batches_id_seq'::regclass), '', 'processing'::batch_status, nextval('diploma_batches_total_records_seq'::regclass), '', '', now(), now());

-------------------------------------------------------------------------------------------------------------------

-- academy_pohuazlicalli.sessions definition

-- Drop table

-- DROP TABLE academy_pohuazlicalli.sessions;

CREATE TABLE academy_pohuazlicalli.sessions (
	sid varchar NOT NULL,
	sess jsonb NOT NULL,
	expire timestamp NOT NULL,
	CONSTRAINT sessions_pkey PRIMARY KEY (sid)
);
CREATE INDEX "IDX_session_expire" ON academy_pohuazlicalli.sessions USING btree (expire);


INSERT INTO academy_pohuazlicalli.sessions
(sid, sess, expire)
VALUES('', '', '');


-------------------------------------------------------------------------------------------------------------------

-- academy_pohuazlicalli.signatures definition

-- Drop table

-- DROP TABLE academy_pohuazlicalli.signatures;

CREATE TABLE academy_pohuazlicalli.signatures (
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


-- academy_pohuazlicalli.signatures foreign keys

ALTER TABLE academy_pohuazlicalli.signatures ADD CONSTRAINT signatures_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES academy_pohuazlicalli.users(id);



-------------------------------------------------------------------------------------------------------------------

CREATE TYPE academy_pohuazlicalli.template_status AS ENUM (
  'Active',
  'Inactive'
);
-- academy_pohuazlicalli.templates definition

-- Drop table

-- DROP TABLE academy_pohuazlicalli.templates;

CREATE TABLE academy_pohuazlicalli.templates (
--	id serial4 NOT NULL,
    id int4 GENERATED ALWAYS AS IDENTITY( INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START 1 CACHE 1 NO CYCLE) NOT NULL,
	"name" varchar(255) NOT NULL,
	url text NOT NULL,
	status academy_pohuazlicalli."template_status" DEFAULT 'Inactive' NOT NULL,
	created_by varchar NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT templates_pkey PRIMARY KEY (id)
);


-- academy_pohuazlicalli.templates foreign keys

ALTER TABLE academy_pohuazlicalli.templates ADD CONSTRAINT templates_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES academy_pohuazlicalli.users(id);




-------------------------------------------------------------------------------------------------------------------

export ACADEMY_DATABASE_URL=<< this is not required is done by secret manager>
export ACADEMY_DB_SECRET_MANAGER=
export ACADEMY_INTERNAL_APP_DOMAIN=admin.<website>.com
export ACADEMY_DEV_DOMAIN=localhost:5000
----- for logging into production  console.log 
export ACADEMY_NODE_ENV=production
-----------------  S3 templates:
---- arn:aws:s3:::my-bucket
---  /<my-bucket-name>/generacion-diplomas/empty-templates/<4-digit-year>
---  /<my-bucket-name>//generacion-diplomas/signatures/<4-digit-year>/
---  /<my-bucket-name>//generacion-diplomas/generated-diplomas/<id-generation-db>
export ACADEMY_PUBLIC_OBJECT_SEARCH_PATHS=
export ACADEMY_PRIVATE_OBJECT_DIR=
export ACADEMY_ISSUER_URL=
export ACADEMY_SESSION_SECRET=any-word-for-generatin-sessionbrowser

---- replitAuth.ts ---
ACADEMY_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
ACADEMY_GOOGLE_CLIENT_SECRET=xxxx
ACADEMY_GOOGLE_CALLBACK_URL=http://localhost:5000/api/callback
ACADEMY_DB_SECRET_MANAGER=

# Allow only Gmail:
ACADEMY_ALLOWED_DOMAINS=gmail.com

# Or allow Gmail + school domain:
# ACADEMY_ALLOWED_DOMAINS=gmail.com,pohualizcalli.edu


-- export ACADEMY_REPL_ID=







-------------------------------------------------------------------------------------------------------------------






-------------------------------------------------------------------------------------------------------------------






-------------------------------------------------------------------------------------------------------------------






-------------------------------------------------------------------------------------------------------------------

