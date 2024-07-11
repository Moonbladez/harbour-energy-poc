import type { ChatStreamingInputSchema } from '~/modules/llms/server/llm.server.streaming';
import type { DLLMId } from '~/modules/llms/store-llms';
import { findVendorForLlmOrThrow } from '~/modules/llms/vendors/vendors.registry';

import { apiStream } from '~/common/util/trpc.client';

import type { IntakeAccess, IntakeContextChatStream, IntakeModel } from '../server/intake/schemas.intake.api';

import type { AixChatContentGenerateRequest } from './aix.client.api';


export type StreamingClientUpdate = Partial<{
  textSoFar: string;
  typing: boolean;
  originLLM: string;
}>;


export async function aixStreamingChatGenerate<TSourceSetup = unknown, TAccess extends ChatStreamingInputSchema['access'] = ChatStreamingInputSchema['access']>(
  llmId: DLLMId,
  chatGenerate: AixChatContentGenerateRequest,
  intakeContextName: IntakeContextChatStream['name'],
  intakeContextRef: string,
  abortSignal: AbortSignal,
  onUpdate: (update: StreamingClientUpdate, done: boolean) => void,
): Promise<void> {

  // id to DLLM and vendor
  const { llm, vendor } = findVendorForLlmOrThrow<TSourceSetup, TAccess>(llmId);

  // FIXME: relax the forced cast
  // const llmOptions = llm.options;
  const intakeModel = intakeModelFromLLMOptions(llm.options, llmId);

  // get the access
  const partialSourceSetup = llm._source.setup;
  const intakeAccess = vendor.getTransportAccess(partialSourceSetup);

  // get any vendor-specific rate limit delay
  const delay = vendor.getRateLimitDelay?.(llm, partialSourceSetup) ?? 0;
  if (delay > 0)
    await new Promise(resolve => setTimeout(resolve, delay));

  // [OpenAI-only] check for harmful content with the free 'moderation' API, if the user requests so
  // if (intakeAccess.dialect === 'openai' && intakeAccess.moderationCheck) {
  //   const moderationUpdate = await _openAIModerationCheck(intakeAccess, messages.at(-1) ?? null);
  //   if (moderationUpdate)
  //     return onUpdate({ textSoFar: moderationUpdate, typing: false }, true);
  // }


  // execute via the vendor
  // return await vendor.streamingChatGenerateOrThrow(intakeAccess, llmId, llmOptions, messages, contextName, contextRef, functions, forceFunctionName, abortSignal, onUpdate);
  const intakeContext = intakeContextChatStream(intakeContextName, intakeContextRef);
  return await _aixStreamGenerateUnified(intakeAccess, intakeModel, chatGenerate, intakeContext, abortSignal, onUpdate);
}

function intakeContextChatStream(name: IntakeContextChatStream['name'], ref: string): IntakeContextChatStream {
  return { method: 'chat-stream', name, ref };
}

function intakeModelFromLLMOptions(llmOptions: Record<string, any>, debugLlmId: string): IntakeModel {
  // model params (llm)
  const { llmRef, llmTemperature, llmResponseTokens } = llmOptions || {};
  if (!llmRef || llmTemperature === undefined)
    throw new Error(`Error in configuration for model ${debugLlmId}: ${JSON.stringify(llmOptions)}`);

  return {
    id: llmRef,
    temperature: llmTemperature,
    ...(llmResponseTokens ? { maxTokens: llmResponseTokens } : {}),
  };
}


/**
 * Client side chat generation, with streaming. This decodes the (text) streaming response from
 * our server streaming endpoint (plain text, not EventSource), and signals updates via a callback.
 *
 * Vendor-specific implementation is on our server backend (API) code. This function tries to be
 * as generic as possible.
 *
 * NOTE: onUpdate is callback when a piece of a message (text, model name, typing..) is received
 */
async function _aixStreamGenerateUnified(
  // input
  access: IntakeAccess,
  model: IntakeModel,
  chatGenerate: AixChatContentGenerateRequest,
  context: IntakeContextChatStream,
  // others
  abortSignal: AbortSignal,
  onUpdate: (update: StreamingClientUpdate, done: boolean) => void,
): Promise<void> {

  const x = await apiStream.aix.chatGenerateContentStream.mutate(
    { access, model, chatGenerate, context },
    { signal: abortSignal },
  );

  let incrementalText = '';

  try {
    for await (const update of x) {
      console.log('cs update:', update);

      if ('t' in update) {
        incrementalText += update.t;
        onUpdate({ textSoFar: incrementalText, typing: true }, false);
      } else if ('set' in update) {
        if (update.set.model)
          onUpdate({ originLLM: update.set.model }, false);
        else
          console.log('set:', update.set);
      } else if ('issueId' in update) {
        incrementalText += update.issueText;
        onUpdate({ textSoFar: incrementalText, typing: true }, false);
      } else
        console.log('update:', update);
    }
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || (error.cause instanceof DOMException && error.cause.name === 'AbortError'))) {
      console.log('client-side aborted 111111111111111111111111111222222');
    } else {
      console.error('aix stream gen Client catch:', (error as any).name, { error });
    }
  }

  console.log('HERE', abortSignal.aborted ? 'client-initiated ABORTED' : '');

  onUpdate({ typing: false }, true);
}
