import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthNotice from './AuthNotice'
import { useAuth } from '../context/AuthContext'

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }))

describe('AuthNotice', () => {
  const dismissAuthNotice = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useAuth.mockReturnValue({
      authNotice: {
        title: 'Welcome back, Miriam!',
      },
      dismissAuthNotice,
    })
  })

  it('shows and dismisses the welcome notification', () => {
    render(<AuthNotice />)
    expect(screen.getByRole('status')).toHaveTextContent('Welcome back, Miriam!')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(dismissAuthNotice).toHaveBeenCalledOnce()
  })
})
