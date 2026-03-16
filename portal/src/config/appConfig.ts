export const APP_BASENAME = '/portal'

export const LOGIN_PATH = '/login'

export const getLoginUrl = () => `${APP_BASENAME}${LOGIN_PATH}`

export interface LoginBranding {
	appName: string
	productLabel: string
	headline: string
	description: string
	supportEmail: string | null
	supportPhone: string | null
	supportHours: string
	organizationName: string | null
}

export const DEFAULT_LOGIN_BRANDING: LoginBranding = {
	appName: 'FieldWorker',
	productLabel: 'Field Service Platform',
	headline: 'Защищённый вход в рабочее пространство',
	description:
		'Единая авторизация для администраторов, диспетчеров и исполнителей с tenant-изоляцией по организациям.',
	supportEmail: null,
	supportPhone: null,
	supportHours: 'Пн-Пт, 09:00-18:00',
	organizationName: null,
}

const readOptionalEnv = (value: string | undefined): string | null => {
	const normalized = value?.trim()
	return normalized ? normalized : null
}

function readOptionalString(value: string | null | undefined): string | null {
	const normalized = value?.trim()
	return normalized ? normalized : null
}

export function getLoginBranding(search = ''): LoginBranding {
	const params = new URLSearchParams(search)

	const organizationName =
		params.get('org')?.trim() || readOptionalEnv(import.meta.env.VITE_LOGIN_ORG_NAME)

	return {
		appName: import.meta.env.VITE_APP_NAME?.trim() || DEFAULT_LOGIN_BRANDING.appName,
		productLabel:
			import.meta.env.VITE_LOGIN_PRODUCT_LABEL?.trim() || DEFAULT_LOGIN_BRANDING.productLabel,
		headline:
			organizationName != null
				? `Вход для ${organizationName}`
				: import.meta.env.VITE_LOGIN_HEADLINE?.trim() || DEFAULT_LOGIN_BRANDING.headline,
		description:
			organizationName != null
				? `Защищённый доступ к заявкам, пользователям и адресам организации ${organizationName}.`
				: import.meta.env.VITE_LOGIN_DESCRIPTION?.trim() || DEFAULT_LOGIN_BRANDING.description,
		supportEmail: readOptionalEnv(import.meta.env.VITE_SUPPORT_EMAIL),
		supportPhone: readOptionalEnv(import.meta.env.VITE_SUPPORT_PHONE),
		supportHours:
			import.meta.env.VITE_SUPPORT_HOURS?.trim() || DEFAULT_LOGIN_BRANDING.supportHours,
		organizationName,
	}
}

export function resolveLoginBranding(
	branding: Partial<LoginBranding> | null | undefined,
	search = ''
): LoginBranding {
	const fallback = getLoginBranding(search)
	const params = new URLSearchParams(search)
	const orgOverride = readOptionalString(params.get('org'))

	return {
		appName: branding?.appName?.trim() || fallback.appName,
		productLabel: branding?.productLabel?.trim() || fallback.productLabel,
		headline: branding?.headline?.trim() || fallback.headline,
		description: branding?.description?.trim() || fallback.description,
		supportEmail: readOptionalString(branding?.supportEmail) ?? fallback.supportEmail,
		supportPhone: readOptionalString(branding?.supportPhone) ?? fallback.supportPhone,
		supportHours: branding?.supportHours?.trim() || fallback.supportHours,
		organizationName: orgOverride ?? readOptionalString(branding?.organizationName) ?? fallback.organizationName,
	}
}
