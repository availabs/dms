new feature: templates

problem: 
when a site / pattern is created, it's blank. having templates at each level makes the UX better. 

when a site is created, it should give user templates to choose form, and based on the selection,
create different patterns with some content. like a blog can just have a page pattern with one blog in it. 
a dashboard template can add a datasets pattern, with one or two tables, and a page pattern with one page
designed and laid out like a template. there can be more templates, a custom option that lets the user select 
what patterns they want, and a blank option that only creates the site. just like now. all of these ofc always 
creates the auth pattern just as it does now.

same for page, while adding a new page, user must be given options to choose from. and a blank should be an option too.
same for components. templates live at pattern level, or in the respective themes. the ones from the theme are available 
on launch. the ones on the pattern are created by the user and saved in db. 

for example, a site using mny theme would get some templates from its theme: src/themes/mny/theme.js. they must be a key
in the file (page_templates) which is an array of objects. each template has a name and the config. it should be ssetup in a way 
so that merely using the object to create an item in the site would give you a proper page, if it's page template. it should 
contain everything it needs. the task here is to come up with a few ideas and add them to theme. 

for the ones that users would create, we need a page in pattern editor that lets them create one and save it on the pattern data.

so, site templates would hold data about what to create along with the site so it looks complete. page template would
hold page item, its sections etc. we'll start with page, and once satisfied move to site template. 

we will place the templates in the default theme so all themes have access to them, as you can see they're merged
with the default theme: src/dms/packages/dms/src/patterns/page/siteConfig.jsx. defaultTheme: src/dms/packages/dms/src/ui/defaultTheme.js


read md files to get context. search the web and find templates. suggest what kind of templates
can be implemented. ask me questions if you have any, and make a thorough plan for yourself to implement it.