import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ElectorateMonitor } from './ElectorateMonitor';
import { ElectorateVoterStatus } from '@/types';

describe('ElectorateMonitor Component', () => {
  const electorateList: ElectorateVoterStatus[] = [
    { user_id: 1, username: 'dm1', name: 'Ketua Panel', role: 'chair', has_voted: true, voted_at: '2026-11-04 21:57:57' },
    { user_id: 2, username: 'dm2', name: 'Anggota Panel 1', role: 'member', has_voted: true, voted_at: '2026-11-19 13:15:59' },
    { user_id: 3, username: 'dm3', name: 'Anggota Panel 2', role: 'member', has_voted: false, voted_at: null },
  ];

  it('1. Skenario 2/3 (Kondisi Real Pilpress): dm1 & dm2 sudah, dm3 belum', () => {
    render(
      <ElectorateMonitor
        electorate={electorateList}
        votesCast={2}
        totalVoters={3}
        currentRound={1}
      />
    );

    expect(screen.getByTestId('electorate-monitor-fraction')).toHaveTextContent('2/3 Suara');
    expect(screen.getByText('Putaran #1')).toBeInTheDocument();
    expect(screen.getByText('Tersisa 1 pemilih belum memberikan suara.')).toBeInTheDocument();

    expect(screen.getByTestId('monitor-voted-dm1')).toHaveTextContent('Sudah Voting');
    expect(screen.getByTestId('monitor-voted-dm2')).toHaveTextContent('Sudah Voting');
    expect(screen.getByTestId('monitor-not-voted-dm3')).toHaveTextContent('Belum Voting');
  });

  it('2. Skenario 0/3: Seluruh panelis belum voting', () => {
    const zeroVotes: ElectorateVoterStatus[] = electorateList.map((e) => ({ ...e, has_voted: false, voted_at: null }));
    render(
      <ElectorateMonitor
        electorate={zeroVotes}
        votesCast={0}
        totalVoters={3}
        currentRound={1}
      />
    );

    expect(screen.getByTestId('electorate-monitor-fraction')).toHaveTextContent('0/3 Suara');
    expect(screen.getByText('Tersisa 3 pemilih belum memberikan suara.')).toBeInTheDocument();
    expect(screen.getByTestId('monitor-not-voted-dm1')).toBeInTheDocument();
    expect(screen.getByTestId('monitor-not-voted-dm2')).toBeInTheDocument();
    expect(screen.getByTestId('monitor-not-voted-dm3')).toBeInTheDocument();
  });

  it('3. Skenario 1/3: Hanya dm1 sudah voting', () => {
    const oneVote: ElectorateVoterStatus[] = [
      { ...electorateList[0], has_voted: true },
      { ...electorateList[1], has_voted: false, voted_at: null },
      { ...electorateList[2], has_voted: false, voted_at: null },
    ];
    render(
      <ElectorateMonitor
        electorate={oneVote}
        votesCast={1}
        totalVoters={3}
        currentRound={1}
      />
    );

    expect(screen.getByTestId('electorate-monitor-fraction')).toHaveTextContent('1/3 Suara');
    expect(screen.getByText('Tersisa 2 pemilih belum memberikan suara.')).toBeInTheDocument();
    expect(screen.getByTestId('monitor-voted-dm1')).toBeInTheDocument();
    expect(screen.getByTestId('monitor-not-voted-dm2')).toBeInTheDocument();
    expect(screen.getByTestId('monitor-not-voted-dm3')).toBeInTheDocument();
  });

  it('4. Skenario 3/3: Seluruh panelis sudah voting', () => {
    const allVotes: ElectorateVoterStatus[] = electorateList.map((e) => ({
      ...e,
      has_voted: true,
      voted_at: '2026-11-19 13:30:00',
    }));
    render(
      <ElectorateMonitor
        electorate={allVotes}
        votesCast={3}
        totalVoters={3}
        currentRound={1}
      />
    );

    expect(screen.getByTestId('electorate-monitor-fraction')).toHaveTextContent('3/3 Suara');
    expect(screen.getByText('Seluruh panelis telah memberikan suara.')).toBeInTheDocument();
    expect(screen.getByTestId('monitor-voted-dm1')).toBeInTheDocument();
    expect(screen.getByTestId('monitor-voted-dm2')).toBeInTheDocument();
    expect(screen.getByTestId('monitor-voted-dm3')).toBeInTheDocument();
  });
});
