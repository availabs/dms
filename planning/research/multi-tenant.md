current setup:
.env file has app and type, it points to a site. site lives in app.data_items table. site has 
refs for patterns, patterns have refs for their children (pages, sources, views). 

every app creates a new schema. there's a data_items table, and then dms_<type> table for other children. 
table structure remains the same until it gets to split-table for sources and views for dataset pattern.

a user goes to /list, and if there's no site, they're navigated to /create to create a new site. 
once filled out, the request is sent to the server where the site is created, the user is created if needed,
and they're assigned an admin group. 

now they can login and create more patterns. they're given auth pattern by default. other users can signup,
and be put into a public group. the admin group users can change their groups to change permissions.

in this setup, a new pattern can be on any subdomain. 

new setup:

user signs up for a subdomain, and each subdomain has a separate app and type. this allows a multi-tenant 
infrastructure, and create separation of data.

major changes need to happen. signup now acts are a create site + signup. once a subdomain and a user is created, 
their /list page is blank, and they can add patterns. these patterns are always bound to the subdomain the signed up for.
they don't see the auth pattern. only the site admins do. site admins use the domain without subdomain to access /list.
they are not shown other subdomains' patterns, but a list of subdomains active. 

once dmsSiteFactory should pull all the 'tenant' subdomains, and match with the subdomain they're on. or 
pass the use along the request so only the valid patterns come back in response. this should then dictate which app
is being used, since all the patterns at a particular subdomain share app. dmsSiteFactory should then use this info
to pull patterns as usual. and every other flow should be unchanged i think. confirm this.

read all the md files to get context. make sure you know the schemas, and how the system works.
client: src/dms/packages/dms
server: src/dms/packages/dms-server
verify there are no logic flaws, and make sure everything makes sense, and then give me a plan. 

in existing setup, a site would have patterns as children, and for new ones, tenants. their dms_type could be tenant (follow type standards, for patterns it does type|<pattern_name>:pattern)
dnsSiteFactory should detect if this is a tenant setup, or not. and both should work all the way through. this mainly concerns 
pattern creation, and the limitation you get for multi tenant mode, afaik. 

to your point about an app baked into adminconfg, we need that. there is always an app and type that represents the main site.
if it is a multi tenant system, the site would hold tenants. and tenants would hold patterns.

in multi-tenant mode, app that's baked into adminconfig defines the main site. the site then refs to tenants just as it now refs to patterns. BUT unlike existing structure, tenants
have their own app. this means their corrosponsing pattern entries are in a different schema. dms_<app>. dmsSiteFactory needs to identify using subdomain AND IF it's a multi-tenant mode
(we can use a flag in app.jsx to identify this) to fetch patterns according to that. once a subdomain based app is identified, other things should be fine. i think.