import { BigNumber, logUtils } from '@0x/utils';
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';

import { StakingPageLayout } from 'ts/components/staking/layout/staking_page_layout';
import { RightInner, Splitview } from 'ts/components/staking/wizard/splitview';
import {
    ConnectWalletPane,
    MarketMakerStakeInputPane,
    RecommendedPoolsStakeInputPane,
    StartStaking,
    TokenApprovalPane,
} from 'ts/components/staking/wizard/wizard_flow';
import { ConfirmationWizardInfo, IntroWizardInfo, TokenApprovalInfo } from 'ts/components/staking/wizard/wizard_info';

import { useAllowance } from 'ts/hooks/use_allowance';
import { useAPIClient } from 'ts/hooks/use_api_client';
import { useQuery } from 'ts/hooks/use_query';
import { useStake } from 'ts/hooks/use_stake';

import { Web3Wrapper } from '@0x/web3-wrapper';
import { animated, useTrail, useTransition } from 'react-spring';
import { Status } from 'ts/components/staking/wizard/status';
import { State } from 'ts/redux/reducer';
import { AccountReady, AccountState, Epoch, Network, PoolWithStats, ProviderState, UserStakingChoice } from 'ts/types';
import { constants } from 'ts/utils/constants';

import { Animation } from 'ts/components/staking/wizard/animation';

export interface StakingWizardProps {
    providerState: ProviderState;
    networkId: Network;
    onOpenConnectWalletDialog: () => void;
}

const Container = styled.div`
    max-width: 1390px;
    margin: 0 auto;
    position: relative;
`;

export interface WizardHookResult {
    step: Step;
    // next: Function;
    // back: Function;
}

enum Step {
    Initial,
}

const useWizard = (): WizardHookResult => {
    const [step, setStep] = useState<Step>(Step.Initial);

    return {
        step,
    };
};

export enum WizardSteps {
    ConnectWallet = 'CONNECT_WALLET',
    Empty = 'EMPTY',
    NoZrxInWallet = 'NO_ZRX_IN_WALLET',
    MarketMakerEntry = 'MARKET_MAKER_ENTRY',
    RecomendedEntry = 'RECOMENDED_ENTRY',
    TokenApproval = 'TOKEN_APPROVAL',
    CoreWizard = 'CORE_WIZARD',
}

export enum WizardInfoSteps {
    IntroductionStats = 'INTRODUCTION',
    Confirmation = 'CONFIRMATION',
    TokenApproval = 'TOKEN_APPROVAL',
}

const AnimatedRightInner = animated(RightInner);

export const StakingWizardBody: React.FC<StakingWizardProps> = props => {
    // If coming from the market maker page, poolId will be provided
    const { poolId } = useQuery<{ poolId: string | undefined }>();

    const networkId = useSelector((state: State) => state.networkId);
    const providerState = useSelector((state: State) => state.providerState);
    const apiClient = useAPIClient(networkId);

    // const [stakeInputAmount, setStakeInputAmount] = useState<string | undefined>(undefined);
    const [stakingPools, setStakingPools] = useState<PoolWithStats[] | undefined>(undefined);
    const [userSelectedStakingPools, setUserSelectedStakingPools] = React.useState<UserStakingChoice[] | undefined>(
        undefined,
    );
    const [currentEpochStats, setCurrentEpochStats] = useState<Epoch | undefined>(undefined);
    const [nextEpochStats, setNextEpochStats] = useState<Epoch | undefined>(undefined);

    const getWizardFlowStatus = (): WizardSteps => {
        if (props.providerState.account.state !== AccountState.Ready) {
            return WizardSteps.ConnectWallet;
        }
        const { zrxBalanceBaseUnitAmount } = providerState.account as AccountReady;
        if (!zrxBalanceBaseUnitAmount) {
            // TODO(johnrjj) This should also add a spinner to the ConnectWallet panel
            // e.g. at this point, the wallet is connected but loading stuff via redux/etc
            return WizardSteps.ConnectWallet;
        }
        const unitAmount = Web3Wrapper.toUnitAmount(zrxBalanceBaseUnitAmount, constants.DECIMAL_PLACES_ZRX).toNumber();
        if (unitAmount < 1) {
            return WizardSteps.NoZrxInWallet;
        }
        // Coming from market maker entry
        if (!userSelectedStakingPools && poolId) {
            return WizardSteps.MarketMakerEntry;
        }
        // Coming from wizard/recommendation entry
        if (!userSelectedStakingPools || providerState.account.state !== AccountState.Ready) {
            return WizardSteps.RecomendedEntry;
        }
        const allowanceBaseUnits = (props.providerState.account as AccountReady).zrxAllowanceBaseUnitAmount || new BigNumber(0);
        const tokensNeedApproval = allowanceBaseUnits.isLessThan(constants.UNLIMITED_ALLOWANCE_IN_BASE_UNITS);
        if (tokensNeedApproval) {
            return WizardSteps.TokenApproval;
        }
        return WizardSteps.CoreWizard;
    };

    const getWizardInfoStatus = (currentWizardFlowStep: WizardSteps): WizardInfoSteps => {
        if (currentWizardFlowStep === WizardSteps.CoreWizard) {
            return WizardInfoSteps.Confirmation;
        }
        if (currentWizardFlowStep === WizardSteps.TokenApproval) {
            return WizardInfoSteps.TokenApproval;
        }
        return WizardInfoSteps.IntroductionStats;
    };

    const flowStatus = getWizardFlowStatus();
    const infoStatus = getWizardInfoStatus(flowStatus);

    const stake = useStake(networkId, providerState);
    const allowance = useAllowance();

    // Load stakingPools
    useEffect(() => {
        const fetchAndSetPools = async () => {
            try {
                const poolsResponse = await apiClient.getStakingPoolsAsync();
                setStakingPools(poolsResponse.stakingPools);
            } catch (err) {
                logUtils.warn(err);
                setStakingPools([]);
            }
        };
        setStakingPools(undefined);
        // tslint:disable-next-line:no-floating-promises
        fetchAndSetPools();
    }, [networkId, apiClient]);

    // Load current and next epoch
    useEffect(() => {
        const fetchAndSetEpochs = async () => {
            try {
                const epochsResponse = await apiClient.getStakingEpochsAsync();
                setCurrentEpochStats(epochsResponse.currentEpoch);
                setNextEpochStats(epochsResponse.nextEpoch);
            } catch (err) {
                logUtils.warn(err);
                setStakingPools([]);
            }
        };
        setCurrentEpochStats(undefined);
        setNextEpochStats(undefined);
        // tslint:disable-next-line:no-floating-promises
        fetchAndSetEpochs();
    }, [networkId, apiClient]);

    const allowanceBaseUnits =
    (props.providerState.account as AccountReady).zrxAllowanceBaseUnitAmount || new BigNumber(0);

    const tokensNeedApproval = allowanceBaseUnits.isLessThan(constants.UNLIMITED_ALLOWANCE_IN_BASE_UNITS);

    // if (tokensNeedApproval) {
    //     allowance.setAllowance();
    // }

    const wizard = useWizard();

    // const step = { stepId: flowStatus };

    const infoPaneTransitions = useTransition(infoStatus, s => s, {
        from: (s: any) => {
            return { position: 'absolute', opacity: 0, transform: 'translate3d(0px, 30px, 0)' };
        },
        enter: () => {
            return { position: 'absolute', opacity: 1, transform: 'translate3d(0px, 0px, 0)', delay: 450 };
        },
        leave: (s: any) => {
            return { opacity: 0, transform: 'translate3d(0px, 30px, 0)' };
        },
        initial: null,
        unique: true,
    });

    const transitions = useTransition(flowStatus, s => s, {
        from: (s: any) => {
            return { opacity: 0, transform: 'translate3d(100%, 0px, 0)' };
        },
        enter: () => {
            return { opacity: 1, transform: 'translate3d(0%, 0px, 0)' };
        },
        leave: (s: any) => {
            return { opacity: 0, transform: 'translate3d(-100%, 0px, 0)' };
        },
        initial: null,
    });

    const [trail, set, stop] = useTrail(4, () => ({
        delay: 100,
        to: { opacity: 1, y: 0 },
        from: { opacity: 0, y: 10 },
    }));

    const { zrxBalanceBaseUnitAmount } = providerState.account as AccountReady;
    let unitAmount: number;
    if (zrxBalanceBaseUnitAmount) {
        unitAmount = Web3Wrapper.toUnitAmount(zrxBalanceBaseUnitAmount, constants.DECIMAL_PLACES_ZRX).toNumber();
    }

    // return (
    //     <div style={{}}>
    //         <Animation padding={'1px'} height={'50px'} width={'120px'} name={'switchUnlock'} />
    //         <Animation padding={'1px'} height={'50px'} width={'120px'} name={'switchSpinner'} />
    //     </div>
    // );

    return (
        <Container>
            <Splitview
                leftComponent={
                    <WizardInfoRelativeContainer>
                        {infoPaneTransitions.map(({ item, props: styleProps, key }) => {
                            return (
                                <AnimatedWizardInfoAbsoluteContaine style={styleProps} key={key}>
                                    <WizardInfoFlexInnerContainer>
                                        {item === WizardInfoSteps.IntroductionStats && (
                                            <IntroWizardInfo trail={trail} />
                                        )}
                                        {item === WizardInfoSteps.TokenApproval && (
                                            <TokenApprovalInfo />
                                        )}
                                        {item === WizardInfoSteps.Confirmation && (
                                            <ConfirmationWizardInfo
                                                selectedStakingPools={userSelectedStakingPools}
                                                currentEpochStats={currentEpochStats}
                                                nextEpochStats={nextEpochStats}
                                            />
                                        )}
                                    </WizardInfoFlexInnerContainer>
                                </AnimatedWizardInfoAbsoluteContaine>
                            );
                        })}
                    </WizardInfoRelativeContainer>
                }
                rightComponent={
                    <AnimatedRightInner>
                    <WizardFlowRelativeContainer>
                        {transitions.map(({ item, props: styleProps, key }) => (
                            <AnimatedWizardFlowAbsoluteContaine key={key} style={styleProps}>
                                <WizardFlowFlexInnerContainer>
                                    {item === WizardSteps.ConnectWallet && (
                                        <ConnectWalletPane
                                            onOpenConnectWalletDialog={props.onOpenConnectWalletDialog}
                                        />
                                    )}
                                    {item === WizardSteps.NoZrxInWallet && (
                                        <Status
                                            title="You have no ZRX balance. You will need some to stake."
                                            linkText="Go buy some ZRX"
                                            linkUrl={`https://www.rexrelay.com/instant/?defaultSelectedAssetData=${constants.ZRX_ASSET_DATA}`}
                                        />
                                    )}
                                    {item === WizardSteps.MarketMakerEntry && (
                                        <MarketMakerStakeInputPane
                                            poolId={poolId}
                                            unitAmount={unitAmount}
                                            stakingPools={stakingPools}
                                            onOpenConnectWalletDialog={props.onOpenConnectWalletDialog}
                                            setSelectedStakingPools={setUserSelectedStakingPools}
                                            zrxBalanceBaseUnitAmount={zrxBalanceBaseUnitAmount}
                                        />
                                    )}
                                    {item === WizardSteps.RecomendedEntry && (
                                        <RecommendedPoolsStakeInputPane
                                            onOpenConnectWalletDialog={props.onOpenConnectWalletDialog}
                                            setSelectedStakingPools={setUserSelectedStakingPools}
                                            stakingPools={stakingPools}
                                            unitAmount={unitAmount}
                                            zrxBalanceBaseUnitAmount={zrxBalanceBaseUnitAmount}
                                        />
                                    )}
                                    {item === WizardSteps.TokenApproval && (
                                        <TokenApprovalPane
                                            address={(providerState.account as AccountReady).address}
                                            allowance={allowance}
                                            stake={stake}
                                            nextEpochStats={nextEpochStats}
                                            providerState={providerState}
                                            selectedStakingPools={userSelectedStakingPools}
                                        />
                                    )
                                    }
                                    {item === WizardSteps.CoreWizard && (
                                        <StartStaking
                                            address={(providerState.account as AccountReady).address}
                                            allowance={allowance}
                                            stake={stake}
                                            nextEpochStats={nextEpochStats}
                                            providerState={providerState}
                                            selectedStakingPools={userSelectedStakingPools}
                                        />
                                    )}
                                </WizardFlowFlexInnerContainer>
                            </AnimatedWizardFlowAbsoluteContaine>
                        ))}
                        {/* <WizardFlowFlexInnerContainer>
                                    <WizardFlow
                                        currentEpochStats={currentEpochStats}
                                        nextEpochStats={nextEpochStats}
                                        selectedStakingPools={userSelectedStakingPools}
                                        setSelectedStakingPools={setUserSelectedStakingPools}
                                        stakingPools={stakingPools}
                                        stake={stake}
                                        allowance={allowance}
                                        networkId={networkId}
                                        providerState={providerState}
                                        onOpenConnectWalletDialog={props.onOpenConnectWalletDialog}
                                        poolId={poolId}
                                    />
                                </WizardFlowFlexInnerContainer> */}
                        {/* </WizardFlowAbsoluteContaine> */}
                    </WizardFlowRelativeContainer>
                    </AnimatedRightInner>
                }
            />
        </Container>
    );
};

export const StakingWizard: React.FC<StakingWizardProps> = props => {
    return (
        <StakingPageLayout isHome={false} title="Start Staking">
            <StakingWizardBody {...props} />
        </StakingPageLayout>
    );
};

const WizardInfoRelativeContainer = styled.div`
    position: relative;
    height: 100%;
    width: 100%;
`;

const WizardInfoAbsoluteContaine = styled.div`
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    left: 0;
`;

const AnimatedWizardInfoAbsoluteContaine = animated(WizardInfoAbsoluteContaine);

// const AnimatedWizardInfoAbsoluteContaine = animated(WizardInfoAbsoluteContaine);

const WizardInfoFlexInnerContainer = styled.div`
    display: flex;
    flex-direction: column;
`;

const WizardFlowRelativeContainer = styled.div`
    position: relative;
    height: 100%;
    width: 100%;
`;

const WizardFlowAbsoluteContaine = styled.div`
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    left: 0;
`;

const WizardFlowFlexInnerContainer = styled.div`
    display: flex;
    flex-direction: column;
`;

// const AnimatedWizardFlowAbsoluteContaine = animated(WizardFlowAbsoluteContaine);

const AnimatedWizardFlowAbsoluteContaine = styled(animated.div)`
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    left: 0;
`;
