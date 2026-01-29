--
-- PostgreSQL database dump
--

-- Dumped from database version 16.2 (Debian 16.2-1.pgdg110+2)
-- Dumped by pg_dump version 16.3 (Ubuntu 16.3-1.pgdg22.04+1)

-- Started on 2024-06-19 20:39:38 UTC

-- SET statement_timeout = 0;
-- SET lock_timeout = 0;
-- SET idle_in_transaction_session_timeout = 0;
-- SET client_encoding = 'UTF8';
-- SET standard_conforming_strings = on;
-- SELECT pg_catalog.set_config('search_path', '', false);
-- SET check_function_bodies = false;
-- SET xmloption = content;
-- SET client_min_messages = warning;
-- SET row_security = off;

--
-- TOC entry 6 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -;
--

CREATE SCHEMA IF NOT EXISTS public;

--
-- TOC entry 3448 (class 0 OID 0)
-- Dependencies: 6
-- Name: SCHEMA public; Type: COMMENT; Schema: -;
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- TOC entry 864 (class 1247 OID 64277)
-- Name: project_row; Type: TYPE; Schema: public;
--

CREATE TYPE public.project_row AS (
	project_name text,
	group_name text,
	auth_level integer
);


--
-- TOC entry 217 (class 1259 OID 64282)
-- Name: foreign_table_plans; Type: FOREIGN TABLE; Schema: public;
--

-- CREATE FOREIGN TABLE public.foreign_table_plans (
--     id bigint,
--     county character varying(100),
--     fips character varying(5),
--     plan_consultant character varying,
--     plan_expiration date,
--     plan_grant character varying,
--     plan_url character varying,
--     plan_status integer,
--     groups character varying[]
-- )
-- SERVER foreign_server_hazmit
-- OPTIONS (
--     schema_name 'plans',
--     table_name 'county'
-- );



--
-- TOC entry 218 (class 1259 OID 64285)
-- Name: foreign_table_plans_county; Type: FOREIGN TABLE; Schema: public;
--

-- CREATE FOREIGN TABLE public.foreign_table_plans_county (
--     id bigint,
--     county character varying(100),
--     fips character varying(5),
--     plan_consultant character varying,
--     plan_expiration date,
--     plan_grant character varying,
--     plan_url character varying,
--     plan_status integer,
--     groups character varying[]
-- )
-- SERVER foreign_server
-- OPTIONS (
--     schema_name 'plans',
--     table_name 'county'
-- );



--
-- TOC entry 219 (class 1259 OID 64288)
-- Name: groups_id_seq; Type: SEQUENCE; Schema: public;
--

CREATE SEQUENCE public.groups_id_seq
    START WITH 102
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 220 (class 1259 OID 64289)
-- Name: groups; Type: TABLE; Schema: public;
--

CREATE TABLE public.groups (
    name text NOT NULL,
    meta json,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text NOT NULL,
    id integer DEFAULT nextval('public.groups_id_seq'::regclass)
);



--
-- TOC entry 221 (class 1259 OID 64296)
-- Name: groups_in_projects; Type: TABLE; Schema: public;
--

CREATE TABLE public.groups_in_projects (
    project_name text NOT NULL,
    group_name text NOT NULL,
    auth_level integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text NOT NULL
);



--
-- TOC entry 222 (class 1259 OID 64303)
-- Name: logins; Type: TABLE; Schema: public;
--

CREATE TABLE public.logins (
    user_email text NOT NULL,
    project_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);



--
-- TOC entry 223 (class 1259 OID 64309)
-- Name: messages; Type: TABLE; Schema: public;
--

CREATE TABLE public.messages (
    message text NOT NULL,
    heading text NOT NULL,
    user_email text NOT NULL,
    viewed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text NOT NULL,
    id bigint NOT NULL
);



-- --
-- -- TOC entry 224 (class 1259 OID 64316)
-- -- Name: messages_old; Type: TABLE; Schema: public;
-- --

-- CREATE TABLE public.messages_old (
--     message text NOT NULL,
--     heading text NOT NULL,
--     user_email text NOT NULL,
--     viewed boolean DEFAULT false NOT NULL,
--     created_at timestamp with time zone DEFAULT now() NOT NULL,
--     created_by text NOT NULL,
--     id bigint NOT NULL
-- );



--
-- TOC entry 225 (class 1259 OID 64323)
-- Name: messages_id_seq; Type: SEQUENCE; Schema: public;
--

CREATE SEQUENCE public.messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



--
-- TOC entry 3450 (class 0 OID 0)
-- Dependencies: 225
-- Name: messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public;
--

--ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages_old.id;


--
-- TOC entry 226 (class 1259 OID 64324)
-- Name: messages_id_seq1; Type: SEQUENCE; Schema: public;
--

CREATE SEQUENCE public.messages_id_seq1
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



--
-- TOC entry 3451 (class 0 OID 0)
-- Dependencies: 226
-- Name: messages_id_seq1; Type: SEQUENCE OWNED BY; Schema: public;
--

ALTER SEQUENCE public.messages_id_seq1 OWNED BY public.messages.id;


--
-- TOC entry 227 (class 1259 OID 64325)
-- Name: messages_new; Type: TABLE; Schema: public;
--

CREATE TABLE public.messages_new (
    heading text NOT NULL,
    message text NOT NULL,
    sent_by text NOT NULL,
    sent_to text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    project_name text,
    viewed boolean DEFAULT false NOT NULL,
    id bigint NOT NULL,
    deleted boolean DEFAULT false NOT NULL
);



--
-- TOC entry 228 (class 1259 OID 64333)
-- Name: messages_new_id_seq; Type: SEQUENCE; Schema: public;
--

CREATE SEQUENCE public.messages_new_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



--
-- TOC entry 3452 (class 0 OID 0)
-- Dependencies: 228
-- Name: messages_new_id_seq; Type: SEQUENCE OWNED BY; Schema: public;
--

ALTER SEQUENCE public.messages_new_id_seq OWNED BY public.messages_new.id;


--
-- TOC entry 229 (class 1259 OID 64334)
-- Name: projects; Type: TABLE; Schema: public;
--

CREATE TABLE public.projects (
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text NOT NULL
);



--
-- TOC entry 230 (class 1259 OID 64340)
-- Name: signup_requests; Type: TABLE; Schema: public;
--

CREATE TABLE public.signup_requests (
    user_email text NOT NULL,
    project_name text NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by text
);



--
-- TOC entry 231 (class 1259 OID 64347)
-- Name: user_preferences; Type: TABLE; Schema: public;
--

CREATE TABLE public.user_preferences (
    user_email text NOT NULL,
    project_name text,
    preferences jsonb
);



--
-- TOC entry 232 (class 1259 OID 64352)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public;
--

CREATE SEQUENCE public.users_id_seq
    START WITH 306
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;



--
-- TOC entry 233 (class 1259 OID 64353)
-- Name: users; Type: TABLE; Schema: public;
--

CREATE TABLE public.users (
    email text NOT NULL,
    password text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    id integer DEFAULT nextval('public.users_id_seq'::regclass)
);



--
-- TOC entry 234 (class 1259 OID 64360)
-- Name: users_in_groups; Type: TABLE; Schema: public;
--

CREATE TABLE public.users_in_groups (
    user_email text NOT NULL,
    group_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text NOT NULL
);



--
-- TOC entry 3252 (class 2604 OID 64366)
-- Name: messages id; Type: DEFAULT; Schema: public;
--

ALTER TABLE ONLY public.messages ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq1'::regclass);


--
-- TOC entry 3258 (class 2604 OID 64367)
-- Name: messages_new id; Type: DEFAULT; Schema: public;
--

ALTER TABLE ONLY public.messages_new ALTER COLUMN id SET DEFAULT nextval('public.messages_new_id_seq'::regclass);


--
-- TOC entry 3255 (class 2604 OID 64368)
-- Name: messages_old id; Type: DEFAULT; Schema: public;
--

--ALTER TABLE ONLY public.messages_old ALTER COLUMN id SET DEFAULT nextval('public.messages_id_seq'::regclass);


--
-- TOC entry 3281 (class 2606 OID 64370)
-- Name: signup_requests group_requests_pkey; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.signup_requests
    ADD CONSTRAINT group_requests_pkey PRIMARY KEY (user_email, project_name);


--
-- TOC entry 3267 (class 2606 OID 64372)
-- Name: groups groups_id_uniq; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_id_uniq UNIQUE (id);


--
-- TOC entry 3271 (class 2606 OID 64374)
-- Name: groups_in_projects groups_in_projects_pkey; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.groups_in_projects
    ADD CONSTRAINT groups_in_projects_pkey PRIMARY KEY (project_name, group_name);


--
-- TOC entry 3269 (class 2606 OID 64376)
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (name);


--
-- TOC entry 3277 (class 2606 OID 64378)
-- Name: messages_new messages_new_pkey; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.messages_new
    ADD CONSTRAINT messages_new_pkey PRIMARY KEY (id);


--
-- TOC entry 3275 (class 2606 OID 64380)
-- Name: messages_old messages_pkey; Type: CONSTRAINT; Schema: public;
--

-- ALTER TABLE ONLY public.messages_old
--     ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- TOC entry 3273 (class 2606 OID 64382)
-- Name: messages messages_pkey1; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey1 PRIMARY KEY (id);


--
-- TOC entry 3279 (class 2606 OID 64384)
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (name);


--
-- TOC entry 3283 (class 2606 OID 64386)
-- Name: users users_id_uniq; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_uniq UNIQUE (id);


--
-- TOC entry 3287 (class 2606 OID 64388)
-- Name: users_in_groups users_in_groups_pkey; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.users_in_groups
    ADD CONSTRAINT users_in_groups_pkey PRIMARY KEY (user_email, group_name);


--
-- TOC entry 3285 (class 2606 OID 64390)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (email);


--
-- TOC entry 3298 (class 2606 OID 64391)
-- Name: users_in_groups group_name_fk; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.users_in_groups
    ADD CONSTRAINT group_name_fk FOREIGN KEY (group_name) REFERENCES public.groups(name) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 3288 (class 2606 OID 64396)
-- Name: groups_in_projects group_name_fk; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.groups_in_projects
    ADD CONSTRAINT group_name_fk FOREIGN KEY (group_name) REFERENCES public.groups(name) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 3290 (class 2606 OID 64401)
-- Name: messages messages_created_by_fkey; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(email);


--
-- TOC entry 3292 (class 2606 OID 64406)
-- Name: messages_new messages_new_project_name_fkey; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.messages_new
    ADD CONSTRAINT messages_new_project_name_fkey FOREIGN KEY (project_name) REFERENCES public.projects(name);


--
-- TOC entry 3293 (class 2606 OID 64411)
-- Name: messages_new messages_new_sent_by_fkey; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.messages_new
    ADD CONSTRAINT messages_new_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES public.users(email);


--
-- TOC entry 3294 (class 2606 OID 64416)
-- Name: messages_new messages_new_sent_to_fkey; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.messages_new
    ADD CONSTRAINT messages_new_sent_to_fkey FOREIGN KEY (sent_to) REFERENCES public.users(email);


--
-- TOC entry 3291 (class 2606 OID 64421)
-- Name: messages messages_user_email_fkey; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_user_email_fkey FOREIGN KEY (user_email) REFERENCES public.users(email);


--
-- TOC entry 3289 (class 2606 OID 64426)
-- Name: groups_in_projects project_name_fk; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.groups_in_projects
    ADD CONSTRAINT project_name_fk FOREIGN KEY (project_name) REFERENCES public.projects(name) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 3295 (class 2606 OID 64431)
-- Name: signup_requests project_name_fk; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.signup_requests
    ADD CONSTRAINT project_name_fk FOREIGN KEY (project_name) REFERENCES public.projects(name) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 3299 (class 2606 OID 64436)
-- Name: users_in_groups user_email_fk; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.users_in_groups
    ADD CONSTRAINT user_email_fk FOREIGN KEY (user_email) REFERENCES public.users(email) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 3296 (class 2606 OID 64441)
-- Name: user_preferences user_preferences_project_name_fkey; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_project_name_fkey FOREIGN KEY (project_name) REFERENCES public.projects(name);


--
-- TOC entry 3297 (class 2606 OID 64446)
-- Name: user_preferences user_preferences_user_email_fkey; Type: FK CONSTRAINT; Schema: public;
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_email_fkey FOREIGN KEY (user_email) REFERENCES public.users(email) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 3449 (class 0 OID 0)
-- Dependencies: 6
-- Name: SCHEMA public; Type: ACL; Schema: -;
--

-- REVOKE USAGE ON SCHEMA public FROM PUBLIC;
-- GRANT ALL ON SCHEMA public TO PUBLIC;


-- Completed on 2024-06-19 20:39:40 UTC

--
-- PostgreSQL database dump complete
--

insert into public.projects (name, created_at, created_by) values ('avail_auth', NOW(), 'admin@availabs.org');
insert into public.groups (name, created_at, created_by) values ('AVAIL', NOW(), 'admin@availabs.org');
insert into public.users (email, password, created_at) values ('admin@availabs.org','$2a$10$b1fJhYT.RiXWdL.rkEpMmuktmZJBRDdZ6rsSX2Euq.XUvw9ka00Um', NOW());
insert into public.users_in_groups (user_email, group_name, created_at, created_by) values ('admin@availabs.org','AVAIL', NOW(),'admin@availabs.org');
insert into public.groups_in_projects (project_name, group_name, auth_level, created_at, created_by) values ('avail_auth','AVAIL', 10, NOW(),'admin@availabs.org');