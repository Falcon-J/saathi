export const validate = {
  title: (value: string) => {
    if (!value || !value.trim()) {
      return { valid: false, error: "Title cannot be empty" }
    }
    if (value.trim().length > 100) {
      return { valid: false, error: "Title must be less than 100 characters" }
    }
    return { valid: true }
  },

  memberId: (value: string) => {
    if (!value || !value.trim()) {
      return { valid: false, error: "Member ID cannot be empty" }
    }
    if (value.trim().length > 50) {
      return { valid: false, error: "Member ID must be less than 50 characters" }
    }
    return { valid: true }
  },

  noDuplicate: (value: string, list: string[]) => {
    if (list.includes(value)) {
      return { valid: false, error: "This member is already in the workspace" }
    }
    return { valid: true }
  },
}
