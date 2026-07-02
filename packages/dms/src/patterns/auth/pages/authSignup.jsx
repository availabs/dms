import React from "react";
import { get } from "lodash-es";
import { Link, useNavigate } from "react-router";
import { useFalcor } from "@availabs/avl-falcor";
import { ThemeContext } from "../../../ui/useTheme";
import { AuthContext } from "../context";
import { callAuthServer } from "../api";
import { nameToSlug, getInstance } from "../../../utils/type-utils";
import { provisionTemplatePatterns } from "../../../utils/tenantProvisioning";
import SiteTemplatePicker from "../../admin/pages/SiteTemplatePicker";

const RESERVED_SUBDOMAINS = ['www', 'api', 'admin', 'mail', 'smtp', 'ftp', 'dev', 'staging', 'test', 'app', 'portal'];
const SUBDOMAIN_RE = /^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9]$/;

function validateSubdomain(slug) {
    if (!slug) return 'Subdomain is required';
    if (!SUBDOMAIN_RE.test(slug)) return 'Subdomain must be 3–63 characters: lowercase letters, digits, hyphens, or underscores';
    if (RESERVED_SUBDOMAINS.includes(slug)) return `"${slug}" is a reserved subdomain`;
    return null;
}

export default function AuthSignup({ disableSignup }) {
    const [credentials, setCredentials] = React.useState({ email: '', password: '', verifyPassword: '' });
    const [tenantForm, setTenantForm] = React.useState({ name: '', subdomain: '' });
    const [selectedTemplateId, setSelectedTemplateId] = React.useState('simple_site');
    const [status, setStatus] = React.useState('');
    const [submitting, setSubmitting] = React.useState(false);
    const { theme, UI } = React.useContext(ThemeContext);
    const { AUTH_HOST, PROJECT_NAME, baseUrl, isMultiTenant, siteType } = React.useContext(AuthContext);
    const siteTemplates = theme?.site_templates ?? [];
    const pageTemplates = theme?.page_templates ?? [];
    const { FieldSet, Button } = UI;
    const navigate = useNavigate();
    const { falcor } = useFalcor();

    const sectionGroupTheme = theme?.auth?.authPages?.sectionGroup?.default || {};

    // Detect whether we are on root domain in multi-tenant mode
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
    const currentSubdomain = hostname.split('.').length >= (isLocalhost ? 2 : 3) ? hostname.split('.')[0] : '';
    const isTenantSignup = isMultiTenant && !currentSubdomain;

    if (disableSignup) {
        return (
            <div className={sectionGroupTheme.pageWrapper}>
                <div className={sectionGroupTheme.pageTitle}>Sign Up Disabled</div>
                <p className='text-sm text-gray-500'>Sign up is not available. Please contact an administrator.</p>
            </div>
        );
    }

    // ── Tenant creation flow ──────────────────────────────────────────────────
    if (isTenantSignup) {
        const handleTenantSignup = async () => {
            setStatus('');
            const slug = nameToSlug(tenantForm.subdomain || tenantForm.name);
            const subdomainError = validateSubdomain(slug);
            if (subdomainError) { setStatus(subdomainError); return; }
            if (!credentials.email) { setStatus('Email is required'); return; }
            if (credentials.password !== credentials.verifyPassword) { setStatus('Passwords do not match'); return; }

            setSubmitting(true);
            try {
                const masterApp = PROJECT_NAME;
                const siteInstance = getInstance(siteType) || siteType;
                const tenantName = tenantForm.name || slug;

                // 1. Create auth project + admin/public groups + first user
                const setupRes = await callAuthServer(`${AUTH_HOST}/init/setup`, {
                    email: credentials.email,
                    password: credentials.password,
                    project: slug,
                });
                if (setupRes.error && setupRes.error !== 'duplicate key value violates unique constraint "groups_pkey"') {
                    throw new Error(setupRes.error);
                }

                // 2. Create tenant row in master app
                const tenantType = `${siteInstance}|${slug}:tenant`;
                const tenantRes = await falcor.call(
                    ['dms', 'data', 'create'],
                    [masterApp, tenantType, { name: tenantName, subdomain: slug, app: slug }]
                );
                const tenantId = Object.keys(tenantRes?.json?.dms?.data?.byId || {}).find(k => k !== '$__path');
                if (!tenantId) throw new Error('Failed to create tenant row');

                // 3. Append tenant ref to master site's tenants array
                const siteKey = `${masterApp}+${siteInstance}:site`;
                await falcor.get(['dms', 'data', siteKey, 'byIndex', [0], ['id', 'data']]);
                const cache = falcor.getCache();
                const byIndexRef = get(cache, ['dms', 'data', siteKey, 'byIndex', 0]);
                if (!byIndexRef?.value) throw new Error('Master site not found');
                const siteRow = get(cache, [...byIndexRef.value]);
                const siteId = siteRow?.id;
                if (!siteId) throw new Error('Master site ID not found');
                const siteDataValue = siteRow?.data?.$type === 'atom' ? siteRow.data.value : siteRow?.data;
                const currentTenants = Array.isArray(siteDataValue?.tenants) ? siteDataValue.tenants : [];
                await falcor.call(['dms', 'data', 'edit'], [masterApp, +siteId, {
                    tenants: [...currentTenants, { ref: `${masterApp}+${siteInstance}|tenant`, id: +tenantId }]
                }]);

                // 4. Create tenant's own site row in tenant app
                const tenantSiteRes = await falcor.call(
                    ['dms', 'data', 'create'],
                    [slug, `${siteInstance}:site`, { site_name: tenantName }]
                );
                const tenantSiteId = Object.keys(tenantSiteRes?.json?.dms?.data?.byId || {}).find(k => k !== '$__path');
                if (!tenantSiteId) throw new Error('Failed to create tenant site');

                // 5. Create tenant's auth pattern
                const authPatternRes = await falcor.call(
                    ['dms', 'data', 'create'],
                    [slug, `${siteInstance}|auth:pattern`, {
                        pattern_type: 'auth',
                        name: 'Auth',
                        base_url: 'auth',
                        subdomain: slug,
                        authPermissions: JSON.stringify({
                            groups: { [`${slug} Admin`]: ['*'], public: [] },
                            users: {}
                        }),
                    }]
                );
                const authPatternId = Object.keys(authPatternRes?.json?.dms?.data?.byId || {}).find(k => k !== '$__path');
                if (!authPatternId) throw new Error('Failed to create auth pattern');

                // 6. Create template patterns then update tenant site with all refs.
                // siteId/initialPatternRefs make provisioning register each pattern
                // on the tenant site as it's created (crash-safe).
                const authPatternRef = { ref: `${slug}+${siteInstance}|pattern`, id: +authPatternId };
                const { allPatternRefs: templateRefs, allEnvRefs } = await provisionTemplatePatterns(falcor, {
                    app: slug,
                    siteInstance,
                    selectedTemplateId,
                    siteTemplates,
                    pageTemplates,
                    adminGroupName: slug,
                    subdomain: slug,
                    siteId: tenantSiteId,
                    initialPatternRefs: [authPatternRef],
                });
                const allPatternRefs = [authPatternRef, ...templateRefs];
                const siteUpdate = { patterns: allPatternRefs };
                if (allEnvRefs.length) siteUpdate.dms_envs = allEnvRefs;
                await falcor.call(['dms', 'data', 'edit'], [slug, +tenantSiteId, siteUpdate]);

                // 7. Full-page redirect to subdomain login (different origin — can't use navigate)
                const { protocol, host } = window.location;
                window.location.href = `${protocol}//${slug}.${host}${baseUrl}/login`;
            } catch (err) {
                setStatus(err.message || 'Something went wrong. Please try again.');
                setSubmitting(false);
            }
        };

        return (
            <div className={sectionGroupTheme.pageWrapper}>
                <div className={sectionGroupTheme.pageTitle}>Create Account</div>

                <FieldSet
                    components={[
                        {
                            type: 'Input',
                            label: 'Organization Name',
                            value: tenantForm.name,
                            onChange: (e) => setTenantForm({ ...tenantForm, name: e.target.value }),
                        },
                        {
                            type: 'Input',
                            label: 'Subdomain',
                            value: tenantForm.subdomain,
                            onChange: (e) => setTenantForm({ ...tenantForm, subdomain: e.target.value }),
                        },
                        {
                            type: 'Input',
                            label: 'Email',
                            value: credentials.email,
                            onChange: (e) => setCredentials({ ...credentials, email: e.target.value }),
                        },
                        {
                            type: 'Input',
                            input_type: 'password',
                            label: 'Password',
                            value: credentials.password,
                            onChange: (e) => setCredentials({ ...credentials, password: e.target.value }),
                        },
                        {
                            type: 'Input',
                            input_type: 'password',
                            label: 'Verify Password',
                            value: credentials.verifyPassword,
                            onChange: (e) => setCredentials({ ...credentials, verifyPassword: e.target.value }),
                        },
                    ]}
                />

                <SiteTemplatePicker
                    siteTemplates={siteTemplates}
                    selectedTemplateId={selectedTemplateId}
                    onSelect={setSelectedTemplateId}
                />

                {status && <div className='text-sm text-red-600 mt-2'>{status}</div>}

                <Button
                    type='plain'
                    className={sectionGroupTheme.actionButton}
                    disabled={submitting || credentials.password !== credentials.verifyPassword}
                    onClick={handleTenantSignup}
                >
                    <span className={sectionGroupTheme.actionText}>
                        {submitting ? 'Creating…' : 'Create Account'}
                    </span>
                </Button>

                <div className={sectionGroupTheme.prompt}>
                    Already have an account?{' '}
                    <span>
                        <Link to={`${baseUrl}/login`} className={sectionGroupTheme.forgotPasswordText}>Sign in</Link>
                    </span>
                </div>
            </div>
        );
    }

    // ── Standard single-user signup (unchanged) ───────────────────────────────
    if (status) return <div>{status}</div>;
    return (
        <div className={sectionGroupTheme.pageWrapper}>
            <div className={sectionGroupTheme.pageTitle}>Sign Up</div>

            <FieldSet
                components={[
                    {
                        type: 'Input',
                        label: 'Email',
                        value: credentials.email,
                        onChange: (e) => setCredentials({ ...credentials, email: e.target.value }),
                    },
                    {
                        type: 'Input',
                        input_type: 'password',
                        label: 'Password',
                        value: credentials.password,
                        onChange: (e) => setCredentials({ ...credentials, password: e.target.value }),
                    },
                    {
                        type: 'Input',
                        input_type: 'password',
                        label: 'Verify Password',
                        value: credentials.verifyPassword,
                        onChange: (e) => setCredentials({ ...credentials, verifyPassword: e.target.value }),
                    },
                ]}
            />

            <Button
                type='plain'
                className={sectionGroupTheme.actionButton}
                disabled={credentials.password !== credentials.verifyPassword}
                onClick={async () => {
                    const emailTheme = {
                        ...(theme?.auth?.emailTheme || {}),
                        logoUrl:    theme?.logo?.img   || '',
                        logoTitle:  theme?.logo?.title || PROJECT_NAME,
                        siteOrigin: window.location.origin,
                    };
                    await callAuthServer(`${AUTH_HOST}/signup/assign/group`,
                        { ...credentials, project: PROJECT_NAME, emailTheme })
                        .then(res => {
                            if (res.error) {
                                setStatus(res.error);
                                console.error('Error', res.error);
                            } else {
                                setStatus(res.message);
                                navigate(`${baseUrl}/login`);
                            }
                        })
                        .catch(() => {
                            setStatus('Cannot contact authentication server.');
                        });
                }}
            >
                <span className={sectionGroupTheme.actionText}>Sign up</span>
            </Button>

            <div className={sectionGroupTheme.prompt}>
                Already have an account?{' '}
                <span>
                    <Link to={`${baseUrl}/login`} className={sectionGroupTheme.forgotPasswordText}>Sign in</Link>
                </span>
            </div>
        </div>
    );
}
