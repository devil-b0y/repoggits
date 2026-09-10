// Temporarily optional; set EMAIL_VERIFICATION_REQUIRED=true to restore the requirement.
export const emailVerificationRequired = () => process.env.EMAIL_VERIFICATION_REQUIRED === 'true';
