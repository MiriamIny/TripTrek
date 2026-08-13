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
        title: 'Signed in with Google',
        message: 'Your verified Google email is connected to one Trek A Trip account.',
      },
      dismissAuthNotice,
    })
  })

  it('shows and dismisses the linked-account notification', () => {
    render(<AuthNotice />)
    expect(screen.getByRole('status')).toHaveTextContent('Signed in with Google')
    expect(screen.getByRole('status')).toHaveTextContent('connected to one Trek A Trip account')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(dismissAuthNotice).toHaveBeenCalledOnce()
  })
})
