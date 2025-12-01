
--- -----------------------------------------------------------------------------------------------------------------------
---   Creates DB Schema and user

CREATE USER app_pohualizcalli WITH PASSWORD 'MyGat0No10enc0nTr4r45p0rqu3N03st4';

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

--- despues de creacion de las tablas
GRANT USAGE, SELECT ON SEQUENCE
  academy_pohuazlicalli.configuration_id_seq,
  academy_pohuazlicalli.diploma_batches_id_seq,
  academy_pohuazlicalli.diploma_batches_total_records_seq,
  academy_pohuazlicalli.signatures_id_seq,
  academy_pohuazlicalli.templates_id_seq
TO app_pohualizcalli;



academy_pohuazlicalli."role"


-------------------------------------------------------------------------------------------------------------------


-- academy_pohuazlicalli.users definition

-- Drop table

-- DROP TABLE academy_pohuazlicalli.users;

CREATE TABLE academy_pohuazlicalli.users (
	id varchar DEFAULT gen_random_uuid() NOT NULL,
	email varchar NULL,
	first_name varchar NULL,
	last_name varchar NULL,
	profile_image_url varchar NULL,
	"role" academy_pohuazlicalli."role" DEFAULT 'student'::role NOT NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT users_email_unique UNIQUE (email),
	CONSTRAINT users_pkey PRIMARY KEY (id)
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

-- academy_pohuazlicalli.diploma_batches definition

-- Drop table

-- DROP TABLE academy_pohuazlicalli.diploma_batches;

CREATE TABLE academy_pohuazlicalli.diploma_batches (
	id serial4 NOT NULL,
	file_name varchar(255) NOT NULL,
	status academy_pohuazlicalli."batch_status" DEFAULT 'processing'::batch_status NOT NULL,
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
	id serial4 NOT NULL,
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

-- academy_pohuazlicalli.templates definition

-- Drop table

-- DROP TABLE academy_pohuazlicalli.templates;

CREATE TABLE academy_pohuazlicalli.templates (
	id serial4 NOT NULL,
	"name" varchar(255) NOT NULL,
	url text NOT NULL,
	status academy_pohuazlicalli."template_status" DEFAULT 'inactive'::template_status NOT NULL,
	created_by varchar NULL,
	created_at timestamp DEFAULT now() NULL,
	updated_at timestamp DEFAULT now() NULL,
	CONSTRAINT templates_pkey PRIMARY KEY (id)
);


-- academy_pohuazlicalli.templates foreign keys

ALTER TABLE academy_pohuazlicalli.templates ADD CONSTRAINT templates_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES academy_pohuazlicalli.users(id);




-------------------------------------------------------------------------------------------------------------------

export ACADEMY_DATABASE_URL=
export ACADEMY_REPLIT_INTERNAL_APP_DOMAIN=
export ACADEMY_REPLIT_DEV_DOMAIN=
export ACADEMY_NODE_ENV=
export ACADEMY_REPL_ID=
export ACADEMY_PUBLIC_OBJECT_SEARCH_PATHS=
export ACADEMY_PRIVATE_OBJECT_DIR=
export ACADEMY_ISSUER_URL=
export ACADEMY_SESSION_SECRET=






-------------------------------------------------------------------------------------------------------------------






-------------------------------------------------------------------------------------------------------------------






-------------------------------------------------------------------------------------------------------------------






-------------------------------------------------------------------------------------------------------------------

