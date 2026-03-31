use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};

declare_id!("59kc3swV6j6NqvhJoKKXAw1uWqGisY2txtf3LLM9Myhz");

/// AIP Escrow Program
///
/// Conditional payment primitive for the Agent Internet Protocol.
/// Locks USDC in a PDA on task submission. Releases to agent on completion,
/// refunds to payer on failure or timeout.
#[program]
pub mod aip_escrow {
    use super::*;

    /// Initialize a new escrow for a task.
    /// Payer's USDC is transferred to the escrow PDA token account.
    /// `authority` is the server wallet that can release/refund.
    /// `deadline` is the unix timestamp after which the payer can cancel.
    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        task_id: String,
        amount: u64,
        deadline: i64,
    ) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);
        require!(task_id.len() <= 64, EscrowError::TaskIdTooLong);

        let now = Clock::get()?.unix_timestamp;
        require!(deadline > now, EscrowError::InvalidDeadline);

        // Transfer USDC from payer to escrow vault
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.payer_token_account.to_account_info(),
                to: ctx.accounts.escrow_vault.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, amount)?;

        // Initialize escrow state
        let escrow = &mut ctx.accounts.escrow_state;
        escrow.task_id = task_id;
        escrow.payer = ctx.accounts.payer.key();
        escrow.payee = ctx.accounts.payee.key();
        escrow.authority = ctx.accounts.authority.key();
        escrow.mint = ctx.accounts.mint.key();
        escrow.amount = amount;
        escrow.deadline = deadline;
        escrow.status = EscrowStatus::Locked;
        escrow.created_at = Clock::get()?.unix_timestamp;
        escrow.bump = ctx.bumps.escrow_state;
        escrow.vault_bump = ctx.bumps.escrow_vault;

        msg!("Escrow initialized: task={}, amount={}, deadline={}", escrow.task_id, amount, deadline);
        Ok(())
    }

    /// Release escrowed funds to the payee (agent).
    /// Only the designated authority (server) can call this.
    pub fn release_escrow(ctx: Context<ReleaseEscrow>) -> Result<()> {
        let escrow = &ctx.accounts.escrow_state;
        let amount = escrow.amount;
        let task_id = escrow.task_id.clone();

        // PDA signer seeds for the vault
        let seeds = &[
            b"vault",
            escrow.task_id.as_bytes(),
            &[escrow.vault_bump],
        ];
        let signer = &[&seeds[..]];

        // Transfer from escrow vault to payee
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.payee_token_account.to_account_info(),
                authority: ctx.accounts.escrow_vault.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_ctx, amount)?;

        // Update state
        let escrow = &mut ctx.accounts.escrow_state;
        escrow.status = EscrowStatus::Released;

        msg!("Escrow released: task={}, amount={}", task_id, amount);
        Ok(())
    }

    /// Refund escrowed funds to the payer.
    /// Only the designated authority (server) can call this.
    pub fn refund_escrow(ctx: Context<RefundEscrow>) -> Result<()> {
        let escrow = &ctx.accounts.escrow_state;
        let amount = escrow.amount;
        let task_id = escrow.task_id.clone();

        let seeds = &[
            b"vault",
            escrow.task_id.as_bytes(),
            &[escrow.vault_bump],
        ];
        let signer = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.payer_token_account.to_account_info(),
                authority: ctx.accounts.escrow_vault.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_ctx, amount)?;

        let escrow = &mut ctx.accounts.escrow_state;
        escrow.status = EscrowStatus::Refunded;

        msg!("Escrow refunded: task={}, amount={}", task_id, amount);
        Ok(())
    }

    /// Cancel escrow and return funds to payer.
    /// Only the payer can call this, and only after the deadline has passed.
    pub fn cancel_escrow(ctx: Context<CancelEscrow>) -> Result<()> {
        let escrow = &ctx.accounts.escrow_state;
        let now = Clock::get()?.unix_timestamp;
        require!(now >= escrow.deadline, EscrowError::DeadlineNotReached);

        let amount = escrow.amount;
        let task_id = escrow.task_id.clone();

        let seeds = &[
            b"vault",
            escrow.task_id.as_bytes(),
            &[escrow.vault_bump],
        ];
        let signer = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.payer_token_account.to_account_info(),
                authority: ctx.accounts.escrow_vault.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_ctx, amount)?;

        let escrow = &mut ctx.accounts.escrow_state;
        escrow.status = EscrowStatus::Cancelled;

        msg!("Escrow cancelled: task={}, amount={}", task_id, amount);
        Ok(())
    }
}

// ---------------------------------------------------------------
// Account structures
// ---------------------------------------------------------------

#[derive(Accounts)]
#[instruction(task_id: String, amount: u64, deadline: i64)]
pub struct InitializeEscrow<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Payee (agent) wallet — not a signer, validated by business logic
    pub payee: UncheckedAccount<'info>,

    /// CHECK: Authority (server) wallet — can release/refund the escrow
    pub authority: UncheckedAccount<'info>,

    /// Escrow state PDA: seeds = ["escrow", task_id]
    #[account(
        init,
        payer = payer,
        space = EscrowState::SIZE,
        seeds = [b"escrow", task_id.as_bytes()],
        bump
    )]
    pub escrow_state: Account<'info, EscrowState>,

    /// Escrow vault PDA (token account): seeds = ["vault", task_id]
    #[account(
        init,
        payer = payer,
        seeds = [b"vault", task_id.as_bytes()],
        bump,
        token::mint = mint,
        token::authority = escrow_vault,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    /// Payer's USDC token account
    #[account(
        mut,
        constraint = payer_token_account.owner == payer.key(),
        constraint = payer_token_account.mint == mint.key(),
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ReleaseEscrow<'info> {
    #[account(
        mut,
        constraint = authority.key() == escrow_state.authority @ EscrowError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow_state.task_id.as_bytes()],
        bump = escrow_state.bump,
        constraint = escrow_state.status == EscrowStatus::Locked @ EscrowError::NotLocked,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        seeds = [b"vault", escrow_state.task_id.as_bytes()],
        bump = escrow_state.vault_bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = payee_token_account.owner == escrow_state.payee @ EscrowError::InvalidPayee,
        constraint = payee_token_account.mint == escrow_state.mint @ EscrowError::InvalidMint,
    )]
    pub payee_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RefundEscrow<'info> {
    #[account(
        mut,
        constraint = authority.key() == escrow_state.authority @ EscrowError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow_state.task_id.as_bytes()],
        bump = escrow_state.bump,
        constraint = escrow_state.status == EscrowStatus::Locked @ EscrowError::NotLocked,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        seeds = [b"vault", escrow_state.task_id.as_bytes()],
        bump = escrow_state.vault_bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = payer_token_account.owner == escrow_state.payer @ EscrowError::InvalidPayer,
        constraint = payer_token_account.mint == escrow_state.mint @ EscrowError::InvalidMint,
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelEscrow<'info> {
    /// Only the original payer can cancel
    #[account(
        mut,
        constraint = payer.key() == escrow_state.payer @ EscrowError::Unauthorized,
    )]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow_state.task_id.as_bytes()],
        bump = escrow_state.bump,
        constraint = escrow_state.status == EscrowStatus::Locked @ EscrowError::NotLocked,
    )]
    pub escrow_state: Account<'info, EscrowState>,

    #[account(
        mut,
        seeds = [b"vault", escrow_state.task_id.as_bytes()],
        bump = escrow_state.vault_bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = payer_token_account.owner == escrow_state.payer @ EscrowError::InvalidPayer,
        constraint = payer_token_account.mint == escrow_state.mint @ EscrowError::InvalidMint,
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------

#[account]
pub struct EscrowState {
    pub task_id: String,        // max 64 bytes
    pub payer: Pubkey,
    pub payee: Pubkey,
    pub authority: Pubkey,      // server wallet — can release/refund
    pub mint: Pubkey,
    pub amount: u64,
    pub deadline: i64,          // unix timestamp — payer can cancel after this
    pub status: EscrowStatus,
    pub created_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
}

impl EscrowState {
    // 8 (discriminator) + (4+64) task_id + 32*4 (payer,payee,authority,mint)
    // + 8 (amount) + 8 (deadline) + 1 (status) + 8 (created_at) + 1 (bump) + 1 (vault_bump)
    pub const SIZE: usize = 8 + (4 + 64) + 32 + 32 + 32 + 32 + 8 + 8 + 1 + 8 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum EscrowStatus {
    Locked,
    Released,
    Refunded,
    Cancelled,
}

// ---------------------------------------------------------------
// Errors
// ---------------------------------------------------------------

#[error_code]
pub enum EscrowError {
    #[msg("Escrow is not in Locked state")]
    NotLocked,
    #[msg("Invalid amount: must be greater than 0")]
    InvalidAmount,
    #[msg("Task ID too long: maximum 64 characters")]
    TaskIdTooLong,
    #[msg("Invalid payee account")]
    InvalidPayee,
    #[msg("Invalid payer account")]
    InvalidPayer,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Unauthorized: signer is not the designated authority")]
    Unauthorized,
    #[msg("Deadline must be in the future")]
    InvalidDeadline,
    #[msg("Cannot cancel: deadline has not been reached yet")]
    DeadlineNotReached,
}
